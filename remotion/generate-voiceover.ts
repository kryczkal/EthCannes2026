import { writeFileSync, mkdirSync, existsSync } from "fs";

// --- CONFIGURATION ---
// Set your ElevenLabs API key as an environment variable:
//   export ELEVENLABS_API_KEY="sk_..."
//
// Pick a voice ID from https://api.elevenlabs.io/v1/voices
// Default: "pNInz6obpgDQGcFmaJgB" (Adam - deep, narrator-style)
// Other good ones:
//   "ErXwobaYiN019PkySvjV" (Antoni - calm, warm)
//   "VR6AewLTigWG4xSOukaG" (Arnold - deep, dramatic)
//   "onwK4e9ZLuTAKqWW03F9" (Daniel - British, authoritative)

const VOICE_ID = process.env.ELEVENLABS_VOICE_ID || "onwK4e9ZLuTAKqWW03F9";
const API_KEY = process.env.ELEVENLABS_API_KEY;

if (!API_KEY) {
  console.error("Missing ELEVENLABS_API_KEY environment variable");
  process.exit(1);
}

const SCENES = [
  {
    id: "01-stats",
    text: "Last year, over seven thousand malicious packages were published to npm.",
    stability: 0.55,
    style: 0.3,
  },
  {
    id: "02-montage",
    text: "Supply chain attacks are everywhere. Axios. Event-Stream. Colors. ua-parser-js. And they're accelerating.",
    stability: 0.45,
    style: 0.5,
  },
  {
    id: "03-money",
    text: "Costing the industry over ten billion dollars.",
    stability: 0.5,
    style: 0.4,
  },
  {
    id: "04-terminal",
    text: "Every time you run npm install... you're trusting strangers with your code.",
    stability: 0.55,
    style: 0.35,
  },
  // Scene 5 (logo reveal) is silence — no voiceover
  {
    id: "06-agent-feed",
    text: "npmguard audits every package with an AI agent before it ever touches your machine. It reads the source, traces dependencies, and hunts for threats — in real time.",
    stability: 0.5,
    style: 0.25,
  },
  {
    id: "07-verdict",
    text: "When it finds something dangerous — you'll know.",
    stability: 0.5,
    style: 0.5,
  },
  {
    id: "08-cli",
    text: "Malicious packages are blocked. Safe ones install directly from verified IPFS — with an immutable verdict published on-chain.",
    stability: 0.5,
    style: 0.3,
  },
  {
    id: "09-closing",
    text: "Know what you install. npmguard.",
    stability: 0.6,
    style: 0.4,
  },
];

const OUTPUT_DIR = "public/voiceover";

async function generateScene(scene: (typeof SCENES)[number]) {
  console.log(`Generating: ${scene.id} — "${scene.text.slice(0, 50)}..."`);

  const response = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}`,
    {
      method: "POST",
      headers: {
        "xi-api-key": API_KEY!,
        "Content-Type": "application/json",
        Accept: "audio/mpeg",
      },
      body: JSON.stringify({
        text: scene.text,
        model_id: "eleven_multilingual_v2",
        voice_settings: {
          stability: scene.stability,
          similarity_boost: 0.75,
          style: scene.style,
        },
      }),
    },
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`ElevenLabs API error for ${scene.id}: ${response.status} — ${error}`);
  }

  const audioBuffer = Buffer.from(await response.arrayBuffer());
  const filePath = `${OUTPUT_DIR}/${scene.id}.mp3`;
  writeFileSync(filePath, audioBuffer);
  console.log(`  Saved: ${filePath} (${(audioBuffer.length / 1024).toFixed(1)} KB)`);
}

async function main() {
  if (!existsSync(OUTPUT_DIR)) {
    mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  console.log(`\nGenerating voiceover for ${SCENES.length} scenes...\n`);
  console.log(`Voice ID: ${VOICE_ID}`);
  console.log(`Output: ${OUTPUT_DIR}/\n`);

  for (const scene of SCENES) {
    await generateScene(scene);
  }

  console.log("\nDone! Voiceover files saved to public/voiceover/");
  console.log("Run `bun run dev` to preview with audio.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
