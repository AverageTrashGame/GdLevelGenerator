const form = document.getElementById("level-form");
const log = document.getElementById("log");

const lengthSeconds = {
  short: 30,
  medium: 60,
  long: 120,
  xl: 180,
};

const difficultySettings = {
  easy: { density: 0.25, speed: 1.0, variation: 0.2 },
  normal: { density: 0.35, speed: 1.1, variation: 0.35 },
  hard: { density: 0.5, speed: 1.2, variation: 0.45 },
  harder: { density: 0.62, speed: 1.3, variation: 0.6 },
  insane: { density: 0.74, speed: 1.35, variation: 0.8 },
  demon: { density: 0.9, speed: 1.45, variation: 0.95 },
};

form.addEventListener("submit", async (event) => {
  event.preventDefault();

  const name = document.getElementById("level-name").value.trim();
  const difficulty = document.getElementById("difficulty").value;
  const length = document.getElementById("length").value;
  const musicFile = document.getElementById("music").files[0];

  if (!name || !musicFile) {
    log.textContent = "Please provide a level name and music file.";
    return;
  }

  const audio = await musicToAnalyzedBuffer(musicFile);
  if (!audio) {
    log.textContent = "Could not decode the audio file. Try another .mp3/.wav file.";
    return;
  }

  const seconds = lengthSeconds[length] ?? 60;
  const objects = generateObjectsFromAudio(audio, seconds, difficulty);
  const gmdContent = buildGmd(name, difficulty, length, musicFile.name, audio.duration, objects);

  downloadFile(`${sanitizeName(name)}.gmd`, gmdContent);

  log.textContent = [
    `Generated: ${name}`,
    `Difficulty: ${difficulty}`,
    `Length preset: ${length} (${seconds}s)` ,
    `Music: ${musicFile.name}`,
    `Detected music duration: ${audio.duration.toFixed(2)}s`,
    `Objects generated: ${objects.length}`,
    "",
    "File downloaded. Import with your GDShare workflow.",
  ].join("\n");
});

async function musicToAnalyzedBuffer(file) {
  try {
    const data = await file.arrayBuffer();
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const buffer = await ctx.decodeAudioData(data.slice(0));
    return buffer;
  } catch {
    return null;
  }
}

function generateObjectsFromAudio(audioBuffer, levelSeconds, difficulty) {
  const settings = difficultySettings[difficulty] ?? difficultySettings.normal;
  const targetDuration = Math.min(levelSeconds, audioBuffer.duration);
  const sampleRate = audioBuffer.sampleRate;
  const channel = audioBuffer.getChannelData(0);
  const beatWindow = Math.max(0.1, 0.4 - settings.variation * 0.2);
  const step = Math.floor(sampleRate * beatWindow);

  const objects = [];
  let x = 0;

  for (let i = 0; i < targetDuration * sampleRate; i += step) {
    const segment = channel.subarray(i, Math.min(i + step, channel.length));
    const rms = Math.sqrt(segment.reduce((sum, sample) => sum + sample * sample, 0) / (segment.length || 1));
    const intensity = Math.min(1, rms * 6);

    if (intensity > (1 - settings.density) * 0.65) {
      const jumpHeight = Math.round(40 + intensity * 130 + Math.random() * 30);
      const timing = (i / sampleRate).toFixed(3);
      objects.push({
        type: intensity > 0.8 ? "spike" : "block",
        x: Math.round(x),
        y: jumpHeight,
        triggerTime: Number(timing),
      });
      x += 80 * settings.speed;
    } else {
      x += 40 * settings.speed;
    }
  }

  return objects;
}

function buildGmd(name, difficulty, length, musicName, duration, objects) {
  const body = objects
    .map((obj, i) => `<object id="${i + 1}" type="${obj.type}" x="${obj.x}" y="${obj.y}" t="${obj.triggerTime}" />`)
    .join("\n    ");

  return `<?xml version="1.0" encoding="UTF-8"?>
<gmd version="1.0">
  <meta>
    <name>${escapeXml(name)}</name>
    <difficulty>${difficulty}</difficulty>
    <length>${length}</length>
    <music file="${escapeXml(musicName)}" duration="${duration.toFixed(3)}" />
    <generator>GdLevelGenerator-Web</generator>
  </meta>
  <level>
    ${body}
  </level>
</gmd>`;
}

function downloadFile(filename, content) {
  const blob = new Blob([content], { type: "application/xml" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function sanitizeName(name) {
  return name.replace(/[^a-z0-9-_]/gi, "_").slice(0, 60) || "generated_level";
}

function escapeXml(value) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
