import { createMemo, createSignal, For, onMount } from "solid-js";
import { ServerTiming } from "./ResultsPage";

interface ServerTimingsProps {
  timings: ServerTiming[];
}
export const ServerTimings = (props: ServerTimingsProps) => {
  const [timingsBox, setTimingsBox] = createSignal<HTMLDivElement>();
  const [fullContainer, setFullContainer] = createSignal<HTMLDivElement>();
  const totalTime = createMemo(() => {
    return props.timings.reduce((acc, t) => acc + t.duration, 0);
  });

  const [availableWidth, setAvailableWidth] = createSignal(0);

  const [fullContainerWidth, setFullContainerWidth] = createSignal(0);

  onMount(() => {
    const observer = new ResizeObserver((entries) => {
      console.log("IT CHANGED");
      const entry = entries[0];
      setAvailableWidth(entry.contentRect.width);
    });
    if (timingsBox() !== undefined) {
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      observer.observe(timingsBox()!);
    }

    const fullContainerObserver = new ResizeObserver((entries) => {
      const entry = entries[0];
      setFullContainerWidth(entry.contentRect.width);
    });
    if (fullContainer() !== undefined) {
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      fullContainerObserver.observe(fullContainer()!);
    }

    return () => {
      observer.disconnect();
      fullContainerObserver.disconnect();
    };
  });

  const labels = createMemo(() => {
    return props.timings.map((t) => t.name);
  });

  const banners = createMemo(() => {
    console.log("RECOMPUTING WITH AVAILABLE WIDTH", availableWidth());
    if (availableWidth() === 0) return [];

    const bannerComponents = [];
    let usedWidth = 0;

    for (let i = 0; i < props.timings.length; i++) {
      const timing = props.timings[i];
      const width = (timing.duration / totalTime()) * availableWidth();
      bannerComponents.push(
        <div
          class={`grid w-full place-items-center bg-magenta-700`}
          style={{
            width: `${width}px`,
            "min-width": `${width}px`,
            "max-width": `${width}px`,
            height: "24px",
            "margin-left": `${usedWidth}px`,
          }}
        >
          <div class="h-full w-full pt-[4px] text-center align-middle text-xs">
            {timing.duration}ms
          </div>
        </div>,
      );
      usedWidth += width;
    }

    return bannerComponents;
  });

  return (
    <div ref={setFullContainer} class="py-2">
      <div class="text-md pl-2 font-semibold">Total Time: {totalTime()}ms</div>
      <div class="flex">
        <div class="shrink px-2 pr-4">
          <For each={labels()}>
            {(name) => (
              <>
                <div
                  style={{
                    "min-width": `${fullContainerWidth() - 18}px`,
                  }}
                  class="absolute border border-neutral-800/80"
                />
                <div class="pl-2">{name}</div>
              </>
            )}
          </For>
          <div
            style={{
              "min-width": `${fullContainerWidth() - 18}px`,
            }}
            class="absolute border border-neutral-800/80"
          />
        </div>
        <div class="mr-8 grow">
          <div
            id="timingsBox"
            ref={setTimingsBox}
            class="grow border-l border-l-neutral-800/80"
          >
            <For each={banners()}>{(component) => component}</For>
          </div>
        </div>
      </div>
    </div>
  );
};