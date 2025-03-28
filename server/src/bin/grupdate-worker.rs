use diesel_async::pooled_connection::{AsyncDieselConnectionManager, ManagerConfig};
use signal_hook::consts::SIGTERM;
use std::sync::{
    atomic::{AtomicBool, Ordering},
    Arc,
};
use trieve_server::{
    data::models,
    errors::ServiceError,
    establish_connection, get_env,
    operators::{
        clickhouse_operator::{ClickHouseEvent, EventQueue},
        group_operator::{update_grouped_chunks_query, GroupUpdateMessage},
    },
};
use trieve_server::{
    data::models::{DatasetConfiguration, WorkerEvent},
    operators::dataset_operator::get_dataset_by_id_query,
};

fn main() {
    dotenvy::dotenv().ok();
    env_logger::builder()
        .target(env_logger::Target::Stdout)
        .filter_level(log::LevelFilter::Info)
        .init();

    let database_url = get_env!("DATABASE_URL", "DATABASE_URL is not set");

    let mut config = ManagerConfig::default();
    config.custom_setup = Box::new(establish_connection);

    let mgr = AsyncDieselConnectionManager::<diesel_async::AsyncPgConnection>::new_with_config(
        database_url,
        config,
    );

    let pool = diesel_async::pooled_connection::deadpool::Pool::builder(mgr)
        .max_size(3)
        .build()
        .expect("Failed to create diesel_async pool");

    let web_pool = actix_web::web::Data::new(pool.clone());

    tokio::runtime::Builder::new_multi_thread()
        .enable_all()
        .build()
        .expect("Failed to create tokio runtime")
        .block_on(async move {
            let redis_url = get_env!("REDIS_URL", "REDIS_URL is not set");
            let redis_connections: u32 = std::env::var("REDIS_CONNECTIONS")
                .unwrap_or("2".to_string())
                .parse()
                .unwrap_or(2);

            let redis_manager = bb8_redis::RedisConnectionManager::new(redis_url)
                .expect("Failed to connect to redis");

            let redis_pool = bb8_redis::bb8::Pool::builder()
                .max_size(redis_connections)
                .connection_timeout(std::time::Duration::from_secs(2))
                .build(redis_manager)
                .await
                .expect("Failed to create redis pool");

            let web_redis_pool = actix_web::web::Data::new(redis_pool);

            let event_queue = if std::env::var("USE_ANALYTICS")
                .unwrap_or("false".to_string())
                .parse()
                .unwrap_or(false)
            {
                log::info!("Analytics enabled");

                let clickhouse_client = clickhouse::Client::default()
                    .with_url(
                        std::env::var("CLICKHOUSE_URL")
                            .unwrap_or("http://localhost:8123".to_string()),
                    )
                    .with_user(std::env::var("CLICKHOUSE_USER").unwrap_or("default".to_string()))
                    .with_password(std::env::var("CLICKHOUSE_PASSWORD").unwrap_or("".to_string()))
                    .with_database(
                        std::env::var("CLICKHOUSE_DATABASE").unwrap_or("default".to_string()),
                    )
                    .with_option("async_insert", "1")
                    .with_option("wait_for_async_insert", "0");

                let mut event_queue = EventQueue::new(clickhouse_client.clone());
                event_queue.start_service();
                event_queue
            } else {
                log::info!("Analytics disabled");
                EventQueue::default()
            };

            let web_event_queue = actix_web::web::Data::new(event_queue);

            let should_terminate = Arc::new(AtomicBool::new(false));
            signal_hook::flag::register(SIGTERM, Arc::clone(&should_terminate))
                .expect("Failed to register shutdown hook");
            let web_redis_pool = web_redis_pool.clone();
            grupdate_worker(should_terminate, web_redis_pool, web_pool, web_event_queue).await;
        });
}

async fn grupdate_worker(
    should_terminate: Arc<AtomicBool>,
    redis_pool: actix_web::web::Data<models::RedisPool>,
    web_pool: actix_web::web::Data<models::Pool>,
    event_queue: actix_web::web::Data<EventQueue>,
) {
    log::info!("Starting grupdate worker service thread");
    let mut redis_conn_sleep = std::time::Duration::from_secs(1);
    #[allow(unused_assignments)]
    let mut opt_redis_connection = None;

    loop {
        let borrowed_redis_connection = match redis_pool.get().await {
            Ok(redis_connection) => Some(redis_connection),
            Err(err) => {
                log::error!("Failed to get redis connection outside of loop: {:?}", err);
                None
            }
        };

        if borrowed_redis_connection.is_some() {
            opt_redis_connection = borrowed_redis_connection;
            break;
        }

        log::info!(
            "Retrying to get redis connection out of loop after {:?} secs",
            redis_conn_sleep
        );
        tokio::time::sleep(redis_conn_sleep).await;
        redis_conn_sleep = std::cmp::min(redis_conn_sleep * 2, std::time::Duration::from_secs(300));
    }
    let mut redis_connection =
        opt_redis_connection.expect("Failed to get redis connection outside of loop");
    let mut broken_pipe_sleep = std::time::Duration::from_secs(10);

    loop {
        if should_terminate.load(Ordering::Relaxed) {
            log::info!("Shutting down");
            break;
        }

        let payload_result: Result<Vec<String>, redis::RedisError> = redis::cmd("brpoplpush")
            .arg("group_update_queue")
            .arg("group_update_processing")
            .arg(1.0)
            .query_async(&mut redis_connection.clone())
            .await;

        let serialized_message = if let Ok(payload) = payload_result {
            broken_pipe_sleep = std::time::Duration::from_secs(10);
            if payload.is_empty() {
                continue;
            }
            payload
                .first()
                .expect("Payload must have a first element")
                .clone()
        } else {
            log::error!("Unable to process {:?}", payload_result);
            if payload_result.is_err_and(|err| err.is_io_error()) {
                log::error!("IO broken pipe error, trying to acquire new connection");
                match redis_pool.get().await {
                    Ok(redis_conn) => {
                        log::info!("Got new redis connection after broken pipe! Resuming polling");
                        redis_connection = redis_conn;
                    }
                    Err(err) => {
                        log::error!(
                                "Failed to get redis connection after broken pipe, will try again after {broken_pipe_sleep:?} secs, err: {:?}",
                                err
                            );
                    }
                }

                tokio::time::sleep(broken_pipe_sleep).await;
                broken_pipe_sleep =
                    std::cmp::min(broken_pipe_sleep * 2, std::time::Duration::from_secs(300));
            }
            continue;
        };

        let group_update_msg: GroupUpdateMessage = match serde_json::from_str(&serialized_message) {
            Ok(msg) => msg,
            Err(err) => {
                log::error!("Failed to deserialize message: {:?}", err);
                continue;
            }
        };

        let dataset_result =
            get_dataset_by_id_query(group_update_msg.dataset_id, web_pool.clone()).await;
        let dataset = match dataset_result {
            Ok(dataset) => dataset,
            Err(err) => {
                let _ = readd_group_error_to_queue(
                    group_update_msg,
                    err.clone(),
                    redis_pool.clone(),
                    event_queue.clone(),
                )
                .await;
                log::error!("Failed to get dataset {:?}", err);
                continue;
            }
        };
        let service_config = DatasetConfiguration::from_json(dataset.server_configuration);

        match update_grouped_chunks_query(
            group_update_msg.prev_group.clone(),
            group_update_msg.group.clone(),
            web_pool.clone(),
            service_config.clone(),
        )
        .await
        {
            Ok(_) => {
                log::info!("Updated group {}", group_update_msg.group.id);
                event_queue
                    .send(ClickHouseEvent::WorkerEvent(
                        WorkerEvent::from_details(
                            group_update_msg.group.dataset_id,
                            None,
                            models::EventType::GroupChunksUpdated {
                                group_id: group_update_msg.group.id,
                            },
                        )
                        .into(),
                    ))
                    .await;

                let _ = redis::cmd("LREM")
                    .arg("group_update_processing")
                    .arg(1)
                    .arg(serialized_message)
                    .query_async::<redis::aio::MultiplexedConnection, usize>(&mut *redis_connection)
                    .await;
            }
            Err(err) => {
                log::error!(
                    "Failed to update group {}: {:?}",
                    group_update_msg.group.id,
                    err
                );

                let _ = readd_group_error_to_queue(
                    group_update_msg,
                    err,
                    redis_pool.clone(),
                    event_queue.clone(),
                )
                .await;
            }
        };
    }
}

pub async fn readd_group_error_to_queue(
    mut payload: GroupUpdateMessage,
    error: ServiceError,
    redis_pool: actix_web::web::Data<models::RedisPool>,
    event_queue: actix_web::web::Data<EventQueue>,
) -> Result<(), ServiceError> {
    let old_payload_message = serde_json::to_string(&payload).map_err(|_| {
        ServiceError::InternalServerError("Failed to reserialize input for retry".to_string())
    })?;

    payload.attempt_number += 1;

    let mut redis_conn = redis_pool
        .get()
        .await
        .map_err(|err| ServiceError::BadRequest(err.to_string()))?;

    let _ = redis::cmd("LREM")
        .arg("group_update_processing")
        .arg(1)
        .arg(old_payload_message.clone())
        .query_async::<redis::aio::MultiplexedConnection, usize>(&mut *redis_conn)
        .await;

    if payload.attempt_number == 3 {
        log::error!("Failed to update group 3 times quitting {:?}", error);
        event_queue
            .send(ClickHouseEvent::WorkerEvent(
                WorkerEvent::from_details(
                    payload.group.dataset_id,
                    None,
                    models::EventType::GroupChunksActionFailed {
                        group_id: payload.group.id,
                        error: error.to_string(),
                    },
                )
                .into(),
            ))
            .await;

        let mut redis_conn = redis_pool
            .get()
            .await
            .map_err(|err| ServiceError::BadRequest(err.to_string()))?;

        redis::cmd("lpush")
            .arg("dead_letters_group")
            .arg(old_payload_message)
            .query_async::<redis::aio::MultiplexedConnection, ()>(&mut *redis_conn)
            .await
            .map_err(|err| ServiceError::BadRequest(err.to_string()))?;

        return Err(ServiceError::InternalServerError(format!(
            "Failed to update grouped chunks 3 times {:?}",
            error
        )));
    }

    let new_payload_message = serde_json::to_string(&payload).map_err(|_| {
        ServiceError::InternalServerError("Failed to reserialize input for retry".to_string())
    })?;

    let mut redis_conn = redis_pool
        .get()
        .await
        .map_err(|err| ServiceError::BadRequest(err.to_string()))?;

    log::error!(
        "Failed to update grouped chunks, re-adding {:?} retry: {:?}",
        error,
        payload.attempt_number
    );

    redis::cmd("lpush")
        .arg("group_update_queue")
        .arg(&new_payload_message)
        .query_async::<redis::aio::MultiplexedConnection, ()>(&mut *redis_conn)
        .await
        .map_err(|err| ServiceError::BadRequest(err.to_string()))?;

    Ok(())
}
