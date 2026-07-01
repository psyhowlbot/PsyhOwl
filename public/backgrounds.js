const HOME_BG_CHUNKS = [
  "/assets/bg-home.1.txt",
  "/assets/bg-home.2.txt",
  "/assets/bg-home.3.txt",
  "/assets/bg-home.4a.txt",
  "/assets/bg-home.4b.txt",
  "/assets/bg-home.4c.txt",
];

async function loadBackgroundFromChunks() {
  try {
    const parts = await Promise.all(
      HOME_BG_CHUNKS.map(async (url) => {
        const response = await fetch(url, { cache: "force-cache" });
        if (!response.ok) throw new Error(`Failed to load ${url}`);
        return response.text();
      })
    );

    const image = parts.join("").replace(/\s/g, "");
    document.documentElement.style.setProperty(
      "--ambient-bg",
      `url("data:image/webp;base64,${image}")`
    );
    document.body.classList.add("art-ready");
  } catch (error) {
    console.warn("Совёнок background failed to load", error);
  }
}

function bindConversationMode() {
  const stopBtn = document.getElementById("stopBtn");
  const startBtn = document.getElementById("startBtn");

  const syncMode = () => {
    const talking = stopBtn && !stopBtn.classList.contains("hidden");
    document.body.classList.toggle("conversation-mode", Boolean(talking));
  };

  startBtn?.addEventListener("click", () => {
    document.body.classList.add("conversation-mode");
  });

  stopBtn?.addEventListener("click", () => {
    document.body.classList.remove("conversation-mode");
  });

  if (stopBtn) {
    const observer = new MutationObserver(syncMode);
    observer.observe(stopBtn, { attributes: true, attributeFilter: ["class"] });
  }

  syncMode();
}

loadBackgroundFromChunks();
bindConversationMode();
