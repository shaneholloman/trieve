/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { createContext, useContext, useRef, useState } from "react";
import { useModalState } from "./modal-context";
import { Chunk } from "../types";
import { getFingerprint } from "@thumbmarkjs/thumbmarkjs";
import { useEffect } from "react";
import { trackViews } from "../trieve";
import {
  ChunkFilter,
  ChunkGroup,
  EventsForTopicResponse,
  RAGAnalyticsResponse,
  ToolFunctionParameter,
} from "trieve-ts-sdk";
import { defaultHighlightOptions } from "../highlight";

export const retryOperation = async <T,>(
  operation: () => Promise<T>,
  maxRetries: number = 10,
  delayMs: number = 100,
): Promise<T> => {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      if (attempt === maxRetries) throw error;
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
  throw new Error("Max retries reached");
};

export type ChunkIdWithIndex = {
  chunk_id: string;
  position: number;
};

const scrollToBottomOfChatModalWrapper = () => {
  const chatModal = document.querySelector(".chat-modal-wrapper");
  if (chatModal) {
    chatModal.scrollTo({
      top: chatModal.scrollHeight,
      behavior: "smooth",
    });
  }
};

export type ComponentMessages = {
  queryId: string | null;
  type: "user" | "system";
  text: string;
  additional: Chunk[] | null;
}[];

const ChatContext = createContext<{
  askQuestion: (
    question?: string,
    group?: ChunkGroup,
    retry?: boolean,
    match_any_tags?: string[],
  ) => Promise<void>;
  isLoading: boolean;
  messages: ComponentMessages;
  currentQuestion: string;
  setCurrentQuestion: React.Dispatch<React.SetStateAction<string>>;
  stopGeneratingMessage: () => void;
  clearConversation: () => void;
  switchToChatAndAskQuestion: (query: string) => Promise<void>;
  cancelGroupChat: () => void;
  chatWithGroup: (group: ChunkGroup, betterGroupName?: string) => void;
  isDoneReading?: boolean;
  rateChatCompletion: (isPositive: boolean, queryId: string | null) => void;
  productsWithClicks: ChunkIdWithIndex[];
}>({
  askQuestion: async () => {},
  currentQuestion: "",
  isLoading: false,
  messages: [],
  setCurrentQuestion: () => {},
  cancelGroupChat: () => {},
  clearConversation: () => {},
  chatWithGroup: () => {},
  switchToChatAndAskQuestion: async () => {},
  stopGeneratingMessage: () => {},
  rateChatCompletion: () => {},
  productsWithClicks: [],
});

function ChatProvider({ children }: { children: React.ReactNode }) {
  const {
    query,
    trieveSDK,
    mode,
    setMode,
    setCurrentGroup,
    imageUrl,
    setImageUrl,
    audioBase64,
    setAudioBase64,
    fingerprint,
    selectedTags,
    currentGroup,
    props,
    selectedSidebarFilters,
  } = useModalState();
  const [currentQuestion, setCurrentQuestion] = useState(query);
  const [currentTopic, setCurrentTopic] = useState("");
  const called = useRef(false);
  const [messages, setMessages] = useState<ComponentMessages>([]);
  const [isLoading, setIsLoading] = useState(false);
  const chatMessageAbortController = useRef<AbortController>(
    new AbortController(),
  );
  const [isDoneReading, setIsDoneReading] = useState(true);
  const [productsWithClicks, setProductsWithClicks] = useState<
    ChunkIdWithIndex[]
  >([]);

  const createTopic = async ({
    question,
    defaultMatchAnyTags,
    defaultMatchAllTags,
  }: {
    question: string;
    defaultMatchAnyTags?: string[];
    defaultMatchAllTags?: string[];
  }) => {
    if (!currentTopic) {
      called.current = true;
      setIsLoading(true);
      setCurrentQuestion("");
      try {
        const topic = await retryOperation(async () => {
          return await trieveSDK.createTopic({
            name: question,
            owner_id: fingerprint,
            metadata: {
              component_props: props,
            },
          });
        });
        setCurrentTopic(topic.id);
        createQuestion({
          id: topic.id,
          question: question,
          defaultMatchAnyTags,
          defaultMatchAllTags,
        });
      } catch (error) {
        console.error("Failed to create topic after multiple retries:", error);
      }
    }
  };

  const clearConversation = () => {
    setCurrentTopic("");
    setMessages([]);
  };

  useEffect(() => {
    if (props.previewTopicId) {
      trieveSDK
        .getAllMessagesForTopic({ messagesTopicId: props.previewTopicId })
        .then((messages) => {
          const componentMessages: ComponentMessages = messages.map(
            (message) => {
              if (message.content.includes("||")) {
                const [additional, text] = message.content.split("||");

                return {
                  queryId: message.id,
                  type: message.role == "assistant" ? "system" : "system",
                  text: text,
                  additional: JSON.parse(additional),
                } as ComponentMessages[0];
              } else {
                return {
                  queryId: message.id,
                  type: message.role,
                  text: message.content,
                  additional: null,
                } as ComponentMessages[0];
              }
            },
          );
          setMessages(componentMessages.slice(1));
        });

      trieveSDK
        .getRagAnalytics({
          type: "events_for_topic",
          topic_id: props.previewTopicId,
        })
        .then((topicEvents: RAGAnalyticsResponse) => {
          const topicEventsResponse = topicEvents as EventsForTopicResponse;

          const allProductsWithClicks = topicEventsResponse.events
            .filter((event) => event.event_type === "click")
            .flatMap((event) => {
              const productsWithClicks = event.items.map((jsonItem) => {
                const serializedItem = JSON.parse(jsonItem) as ChunkIdWithIndex;
                return serializedItem;
              });
              return productsWithClicks;
            });
          setProductsWithClicks(allProductsWithClicks);
        });
    }
  }, []);

  useEffect(() => {
    if (props.groupTrackingId) {
      trieveSDK
        .getGroupByTrackingId({
          trackingId: props.groupTrackingId,
        })
        .then((fetchedGroup) => {
          if (fetchedGroup) {
            chatWithGroup(fetchedGroup, props.cleanGroupName);
          }
        })
        .catch((e) => {
          console.error(e);
        });
    }
  }, []);

  useEffect(() => {
    if (mode == "chat" && audioBase64 && audioBase64 != "") {
      askQuestion(" ");
    }
  }, [audioBase64, mode]);

  const handleReader = async (
    reader: ReadableStreamDefaultReader<Uint8Array>,
    queryId: string | null,
  ) => {
    setIsLoading(true);
    setIsDoneReading(false);
    let done = false;
    let calledAnalytics = false;
    let textInStream = "";
    let state: "READING_TEXT" | "READING_LABEL" | "READING_URL" =
      "READING_TEXT";
    let linkBuffer = "";
    let outputBuffer = "";

    while (!done) {
      const { value, done: doneReading } = await reader.read();
      if (doneReading) {
        done = doneReading;
        setIsDoneReading(true);
      } else if (value) {
        const decoder = new TextDecoder();
        const newText = decoder.decode(value);
        textInStream += newText;

        let text: string = "";
        let jsonData: string = "";

        if (textInStream.includes("||")) {
          [jsonData, text] = textInStream.split("||");
        }

        let json;
        try {
          json = JSON.parse(jsonData);
        } catch {
          json = null;
        }

        if (json && props.analytics && !calledAnalytics) {
          calledAnalytics = true;
          const ecommerceChunks = (json as unknown as Chunk[]).filter(
            (chunk) =>
              (chunk.metadata.heading ||
                chunk.metadata.title ||
                chunk.metadata.page_title) &&
              chunk.link &&
              chunk.image_urls?.length &&
              chunk.num_value,
          );
          if (ecommerceChunks && queryId) {
            trackViews({
              props: props,
              trieve: trieveSDK,
              requestID: queryId,
              type: "rag",
              items: ecommerceChunks.map((chunk) => {
                return chunk.tracking_id ?? "";
              }),
              fingerprint,
            });
          }
        }

        outputBuffer = "";
        linkBuffer = "";
        state = "READING_TEXT";
        for (let i = 0; i < text.length; i++) {
          const char = text[i];

          switch (state) {
            case "READING_TEXT":
              if (char === "[") {
                state = "READING_LABEL";
                linkBuffer = "[";
              } else {
                outputBuffer += char;
              }
              break;

            case "READING_LABEL":
              linkBuffer += char;
              if (char === "]") {
                state = "READING_URL";
              }
              break;

            case "READING_URL":
              linkBuffer += char;
              if (char === ")") {
                state = "READING_TEXT";
                outputBuffer += linkBuffer;
                linkBuffer = "";
              }
              break;
          }
        }

        setMessages((m) => [
          ...m.slice(0, -1),
          {
            type: "system",
            text: outputBuffer,
            additional: json ? json : null,
            queryId,
          },
        ]);
      }
    }
  };

  const createQuestion = async ({
    id,
    question,
    group,
    defaultMatchAnyTags,
    defaultMatchAllTags,
  }: {
    id?: string;
    question?: string;
    group?: ChunkGroup;
    defaultMatchAnyTags?: string[];
    defaultMatchAllTags?: string[];
  }) => {
    setIsLoading(true);
    let curAudioBase64 = audioBase64;
    let questionProp = question;
    const curGroup = group || currentGroup;
    let transcribedQuery: string | null = null;

    // This only works w/ shopify rn
    const recommendOptions = props.recommendOptions;
    if (
      recommendOptions &&
      recommendOptions?.queriesToTriggerRecommendations.includes(
        questionProp ?? "",
      )
    ) {
      try {
        const item = await retryOperation(async () => {
          return await trieveSDK.getChunkByTrackingId({
            trackingId: recommendOptions.productId,
          });
        });
        const metadata = item?.metadata as {
          title: string;
          variantName: string;
        };
        questionProp = `The user wants to find things similar to ${metadata.title} - ${metadata.variantName} and says ${question}. Find me some items that are just like it`;
      } catch (error) {
        console.error("Failed to get product by tracking ID:", error);
      }
    }

    // Use group search
    let filters: ChunkFilter | null = {
      must: null,
      must_not: null,
      should: null,
    };

    if (selectedTags.length > 0) {
      filters.should = [];
      filters.should?.push({
        field: "tag_set",
        match_any: selectedTags.map((t) => t.tag),
      });
    }

    if (
      curGroup &&
      !props.recommendOptions?.queriesToTriggerRecommendations.includes(
        question ?? "",
      )
    ) {
      if (!filters.should) {
        filters.should = [];
      }
      filters.should?.push({
        field: "group_ids",
        match_all: [curGroup.id],
      });
    }

    if (props.chatFilters) {
      if (props.chatFilters.must) {
        if (!filters.must) {
          filters.must = [];
        }
        filters.must?.push(...props.chatFilters.must);
      }
      if (props.chatFilters.must_not) {
        if (!filters.must_not) {
          filters.must_not = [];
        }
        filters.must_not?.push(...props.chatFilters.must_not);
      }
      if (props.chatFilters.should) {
        if (!filters.should) {
          filters.should = [];
        }
        filters.should?.push(...props.chatFilters.should);
      }
    }

    if (
      props.recommendOptions?.filter &&
      props.recommendOptions?.queriesToTriggerRecommendations.includes(
        question ?? "",
      )
    ) {
      if (props.recommendOptions?.filter.must) {
        if (!filters.must) {
          filters.must = [];
        }
        filters.must?.push(...props.recommendOptions.filter.must);
      }
      if (props.recommendOptions?.filter.must_not) {
        if (!filters.must_not) {
          filters.must_not = [];
        }
        filters.must_not?.push(...props.recommendOptions.filter.must_not);
      }
      if (props.recommendOptions?.filter.should) {
        if (!filters.should) {
          filters.should = [];
        }
        filters.should?.push(...props.recommendOptions.filter.should);
      }
    }

    let stoppedGeneratingMessage = false;

    if (
      (!defaultMatchAnyTags || !defaultMatchAnyTags?.length) &&
      !curGroup &&
      (props.tags?.length ?? 0) > 0
    ) {
      let filterParamsRetries = 0;
      while (filterParamsRetries < 3) {
        filterParamsRetries++;
        chatMessageAbortController.current = new AbortController();
        const toolCallTimeout = setTimeout(
          () => {
            console.error(
              "getToolCallFunctionParams timeout on retry: ",
              filterParamsRetries,
            );
            chatMessageAbortController.current.abort();
          },
          imageUrl || curAudioBase64 ? 20000 : 10000,
        );

        try {
          let filterParamsResp = null;
          try {
            filterParamsResp = await retryOperation(async () => {
              return await trieveSDK.getToolCallFunctionParams(
                {
                  user_message_text:
                    questionProp || currentQuestion
                      ? `Get filters from the following messages: ${messages
                          .slice(0, -1)
                          .filter((message) => {
                            return message.type == "user";
                          })
                          .map(
                            (message) => `\n\n${message.text}`,
                          )} \n\n ${questionProp || currentQuestion}`
                      : null,
                  image_url: imageUrl ? imageUrl : null,
                  audio_input: curAudioBase64 ? curAudioBase64 : null,
                  tool_function: {
                    name: "get_filters",
                    description:
                      "Decide on which filters to apply to available catalog being used within the knowledge base to respond. If the question is slightly like a product name, respond with no filters (all false).",
                    parameters:
                      props.tags?.map((tag) => {
                        return {
                          name: tag.label,
                          parameter_type: "boolean",
                          description: tag.description ?? "",
                        } as ToolFunctionParameter;
                      }) ?? [],
                  },
                },
                chatMessageAbortController.current.signal,
                (headers: Record<string, string>) => {
                  if (headers["x-tr-query"] && curAudioBase64) {
                    transcribedQuery = headers["x-tr-query"];
                  }
                },
              );
            });
          } catch (e) {
            console.error("error getting getToolCallFunctionParams", e);
          }

          if (transcribedQuery && curAudioBase64) {
            questionProp = transcribedQuery;
            setAudioBase64("");
            curAudioBase64 = undefined;
            setMessages((m) => {
              return [
                ...m.slice(0, -2),
                {
                  type: "user",
                  text: transcribedQuery ?? "",
                  additional: null,
                  queryId: null,
                  imageUrl: imageUrl ? imageUrl : null,
                },
                {
                  type: "system",
                  text: "Loading...",
                  additional: null,
                  queryId: null,
                },
              ];
            });
          }

          const match_any_tags = [];
          if (filterParamsResp?.parameters) {
            for (const key of Object.keys(filterParamsResp.parameters ?? {})) {
              const filterParam = (filterParamsResp.parameters as any)[
                key as keyof typeof filterParamsResp.parameters
              ];
              if (typeof filterParam === "boolean" && filterParam) {
                const tag = props.tags?.find((t) => t.label === key)?.tag;
                if (tag) {
                  match_any_tags.push(tag);
                }
              }
            }
          }

          if (match_any_tags.length > 0) {
            if (!filters.should) {
              filters.should = [];
            }
            filters.should.push({
              field: "tag_set",
              match_any: match_any_tags,
            });
          }

          clearTimeout(toolCallTimeout);

          break;
        } catch (e) {
          console.error("error getting getToolCallFunctionParams", e);
          clearTimeout(toolCallTimeout);
          if (e && typeof e == "string" && e === "Stopped generating message") {
            stoppedGeneratingMessage = true;
            break;
          }
        }
      }
    }

    if (defaultMatchAnyTags?.length) {
      if (!filters.should) {
        filters.should = [];
      }
      filters.should.push({
        field: "tag_set",
        match_any: defaultMatchAnyTags,
      });
    }
    if (defaultMatchAllTags?.length) {
      if (!filters.should) {
        filters.should = [];
      }
      filters.should.push({
        field: "tag_set",
        match_all: defaultMatchAllTags,
      });
    }
    if (
      filters.must == null &&
      filters.must_not == null &&
      filters.should == null
    ) {
      filters = null;
    }

    let messageReaderRetries = 0;
    let {
      reader,
      queryId,
    }: {
      reader: ReadableStreamDefaultReader<Uint8Array> | null;
      queryId: string | null;
    } = { reader: null, queryId: null };

    while (!stoppedGeneratingMessage && messageReaderRetries < 5) {
      messageReaderRetries++;
      chatMessageAbortController.current = new AbortController();
      const createMessageTimeout = setTimeout(
        () => {
          console.error(
            "createMessageReaderWithQueryId timeout on retry: ",
            messageReaderRetries,
          );
          chatMessageAbortController.current.abort();
        },
        imageUrl || curAudioBase64 ? 20000 : 10000,
      );

      try {
        const result = await trieveSDK.createMessageReaderWithQueryId(
          {
            topic_id: id || currentTopic,
            new_message_content: questionProp || currentQuestion,
            audio_input:
              curAudioBase64 && curAudioBase64?.length > 0
                ? curAudioBase64
                : undefined,
            image_urls: imageUrl ? [imageUrl] : [],
            llm_options: {
              completion_first: false,
            },
            concat_user_messages_query: true,
            user_id: await getFingerprint(),
            page_size: props.searchOptions?.page_size ?? 8,
            score_threshold: props.searchOptions?.score_threshold || null,
            use_group_search: props.useGroupSearch,
            filters: filters,
            metadata: {
              component_props: props,
            },
            currency: props.defaultCurrency,
            highlight_options: {
              ...defaultHighlightOptions,
              highlight_delimiters: ["?", ",", ".", "!", "\n"],
              highlight_window: props.type === "ecommerce" ? 5 : 10,
              highlight_results: true,
            },
            only_include_docs_used: true,
          },
          chatMessageAbortController.current.signal,
          (headers: Record<string, string>) => {
            if (headers["x-tr-query"] && curAudioBase64) {
              transcribedQuery = headers["x-tr-query"];
            }
          },
        );
        reader = result.reader;
        queryId = result.queryId;

        clearTimeout(createMessageTimeout);

        break;
      } catch (e) {
        console.error("error getting createMessageReaderWithQueryId", e);
        clearTimeout(createMessageTimeout);
        if (e && typeof e == "string" && e === "Stopped generating message") {
          stoppedGeneratingMessage = true;
          break;
        }
      }
    }

    if (transcribedQuery && curAudioBase64) {
      setAudioBase64("");
      curAudioBase64 = undefined;
      setMessages((m) => [
        ...m.slice(0, -2),
        {
          type: "user",
          text: transcribedQuery ?? "",
          additional: null,
          queryId: null,
          imageUrl: imageUrl ? imageUrl : null,
        },
        {
          type: "system",
          text: "Loading...",
          additional: null,
          queryId: null,
        },
      ]);
    }

    if (reader) handleReader(reader, queryId);

    if (imageUrl) {
      setImageUrl("");
    }
    if (audioBase64) {
      setAudioBase64("");
    }
  };

  const chatWithGroup = (group: ChunkGroup, betterGroupName?: string) => {
    if (betterGroupName) {
      group.name = betterGroupName;
    }
    clearConversation();
    setCurrentGroup(group);
    setMode("chat");
  };

  const stopGeneratingMessage = () => {
    chatMessageAbortController.current.abort("Stopped generating message");
    chatMessageAbortController.current = new AbortController();
    setIsDoneReading(true);
    setIsLoading(false);

    if (messages.at(-1)?.text === "Loading...") {
      setMessages((messages) => [
        ...messages.slice(0, -1),
        messages[messages.length - 1],
      ]);
    }
  };

  const cancelGroupChat = () => {
    setCurrentGroup(null);
    clearConversation();
  };

  const askQuestion = async (
    question?: string,
    group?: ChunkGroup,
    displayUserMessage?: boolean,
  ) => {
    const questionProp = question;
    setIsDoneReading(false);
    setCurrentQuestion("");

    const trackingId = group?.tracking_id;
    if (trackingId) {
      try {
        const fetchedGroup = await retryOperation(async () => {
          return await trieveSDK.getGroupByTrackingId({
            trackingId,
          });
        });

        if (fetchedGroup) {
          group = {
            created_at: fetchedGroup.created_at,
            updated_at: fetchedGroup.updated_at,
            dataset_id: fetchedGroup.dataset_id,
            description: fetchedGroup.description,
            id: fetchedGroup.id,
            metadata: fetchedGroup.metadata,
            name: props.cleanGroupName
              ? props.cleanGroupName
              : fetchedGroup.name,
            tag_set: fetchedGroup.tag_set,
          } as ChunkGroup;
        }
      } catch (error) {
        console.error(
          "Failed to fetch group by tracking ID after multiple retries:",
          error,
        );
      }
    }

    if (!currentGroup && group) {
      chatWithGroup(group);
      setCurrentGroup(group);
    }

    if (!audioBase64) {
      if (question == undefined || question == null || question == "") {
        question = props.defaultImageQuestion;
      }

      setMessages((m) => [
        ...m,
        {
          type: "user",
          text:
            (displayUserMessage ?? true) ? questionProp || currentQuestion : "",
          additional: null,
          queryId: null,
          imageUrl: imageUrl ? imageUrl : null,
        },
        {
          type: "system",
          text: "Loading...",
          additional: null,
          queryId: null,
        },
      ]);
    } else {
      setMessages((m) => [
        ...m,
        {
          type: "user",
          text: "Loading...",
          additional: null,
          queryId: null,
          imageUrl: imageUrl ? imageUrl : null,
        },
        {
          type: "system",
          text: "Loading...",
          additional: null,
          queryId: null,
        },
      ]);
    }
    scrollToBottomOfChatModalWrapper();

    const defaultMatchAllTags = Object.keys(selectedSidebarFilters)
      .map((key) => selectedSidebarFilters[key])
      .flat();
    if (!currentTopic) {
      await createTopic({
        question: questionProp || currentQuestion,
        defaultMatchAllTags,
      });
    } else {
      await createQuestion({
        question: questionProp || currentQuestion,
        group,
        defaultMatchAllTags,
      });
    }
  };

  const switchToChatAndAskQuestion = async (query: string) => {
    setMode("chat");
    await askQuestion(query);
  };

  const rateChatCompletion = async (
    isPositive: boolean,
    queryId: string | null,
  ) => {
    if (queryId) {
      trieveSDK.rateRagQuery({
        rating: isPositive ? 1 : 0,
        query_id: queryId,
        metadata: {
          component_props: props,
        },
      });
    }
  };

  return (
    <ChatContext.Provider
      value={{
        askQuestion,
        isLoading,
        cancelGroupChat,
        messages,
        currentQuestion,
        chatWithGroup,
        setCurrentQuestion,
        switchToChatAndAskQuestion,
        clearConversation,
        stopGeneratingMessage,
        isDoneReading,
        rateChatCompletion,
        productsWithClicks,
      }}
    >
      {children}
    </ChatContext.Provider>
  );
}

function useChatState() {
  const context = useContext(ChatContext);
  if (!context) {
    throw new Error("useChatState must be used within a ChatProvider");
  }
  return context;
}

export { ChatProvider, useChatState };
