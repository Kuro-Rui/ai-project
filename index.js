// index.js
// Kingdom of Science — Combined features
import "dotenv/config";
import { Client, EmbedBuilder, GatewayIntentBits } from "discord.js";
import axios from "axios";
import fs from "fs";
import path from "path";
import { InferenceClient } from "@huggingface/inference";

// ---------- CONFIG ----------
const PREFIX = "!";
const BMKG_URL =
  process.env.BMKG_URL || "https://api.bmkg.go.id/weather/jakarta"; // replace if needed
const ALERT_CHANNEL_ID = process.env.ALERT_CHANNEL_ID || null;

const HUGGING_API_LIST = [
  process.env.HUGGING_API,
  process.env.HUGGING_API2,
  process.env.HUGGING_API3,
];

let HUGGING_INDEX = 0;
let HUGGING_FACE_API_KEY = HUGGING_API_LIST[HUGGING_INDEX] || null;

const DATA_DIR = "./data";
const SUBSCRIBERS_FILE = path.join(DATA_DIR, "subscribers.json");
const FACTS_FILE = path.join(DATA_DIR, "facts.json");
const QUOTES_FILE = path.join(DATA_DIR, "quotes.json");
const KODE_WILAYAH_FILE = path.join(DATA_DIR, "kode_wilayah.json");
const wilayahData = fs.existsSync(KODE_WILAYAH_FILE)
  ? JSON.parse(fs.readFileSync(KODE_WILAYAH_FILE, "utf8"))
  : [];

// ---------- ENSURE DATA FOLDER ----------
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(SUBSCRIBERS_FILE))
  fs.writeFileSync(SUBSCRIBERS_FILE, "[]", "utf8");
if (!fs.existsSync(FACTS_FILE))
  fs.writeFileSync(FACTS_FILE, JSON.stringify([], null, 2), "utf8");
if (!fs.existsSync(QUOTES_FILE))
  fs.writeFileSync(
    QUOTES_FILE,
    JSON.stringify(
      [
        "Get excited! This is the power of science! — Senku Ishigami",
        "Nothing is impossible with science! — Senku",
        "Science is just a name for the pursuit of knowledge! — Senku",
        "If you don't give up, you can't fail! — Chrome",
      ],
      null,
      2,
    ),
    "utf8",
  );

// ---------- UTILITIES ----------
const readJSON = (p) => JSON.parse(fs.readFileSync(p, "utf8"));
const writeJSON = (p, obj) =>
  fs.writeFileSync(p, JSON.stringify(obj, null, 2), "utf8");
const quotes = readJSON(QUOTES_FILE);
const facts = readJSON(FACTS_FILE);
let hf = new InferenceClient(HUGGING_FACE_API_KEY);

// ---------- DISCORD CLIENT ----------
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

// ---------- LOGIN ----------
client.on("clientReady", async () => {
  console.log(`🤖 Kingdom of Science logged in as ${client.user.tag}`);
  console.log("[MODE-AI] Waiting for sada to wake up");
  // deleteMemory()
  console.log("[MODE-AI] Sada is Online and ready to fully assist you");
});

// ---------- AI HELPERS ----------
async function askAI(prompt, model = "ibm-granite/granite-4.0-micro") {
  try {
    const response = await hf.chatCompletion({
      model: "meta-llama/Llama-3.1-8B-Instruct",
      messages: [{ role: "user", content: prompt }],
      max_tokens: 512,
    });
    HUGGING_INDEX++;
    if (HUGGING_INDEX > 2) HUGGING_INDEX = 0;
    console.log(HUGGING_FACE_API_KEY);
    HUGGING_FACE_API_KEY = HUGGING_API_LIST[HUGGING_INDEX];
    // Some models return a plain string, others return an array/object
    const text =
      response.choices[0].message.content ||
      response[0]?.message.content ||
      response?.output_text ||
      "🤔 No response.";

    return text;
  } catch (error) {
    console.error("❌ AI Error:", error);
    return "⚠️ AI failed to respond. Please try again later.";
  }
}

function sendLongMessage(channel, text) {
  const chunks = text.match(/[\s\S]{1,1999}/g); // split text into 2000-char safe chunks
  for (const chunk of chunks) {
    channel.send(chunk);
  }
}

function findWilayahCode(cityName = "jakarta") {
  const lower = cityName.toLowerCase();
  return wilayahData.find((w) => w.nama.toLowerCase().includes(lower));
}

client.on("messageCreate", async (message) => {
  if (message.author.bot || !message.content.startsWith(PREFIX)) return;
  const [cmd, ...args] = message.content
    .trim()
    .substring(PREFIX.length)
    .split(/\s+/);

  switch (cmd.toLowerCase()) {
    case "ping":
      message.reply("🏓 Pong! Kingdom of Science is online!");
      break;
    case "weather":
      if (args.length === 0) {
        return message.reply(
          "🌦 Please provide a city name, e.g. `!weather Jakarta`",
        );
      }

      const city = args.join(" ");
      const wilayah = findWilayahCode(city);

      if (!wilayah) {
        return message.reply(
          `❌ Sorry, I can't find "${city}" in my region database.`,
        );
      }

      try {
        const response = await axios.get(
          `https://api.bmkg.go.id/publik/prakiraan-cuaca?adm4=${wilayah.kode}`,
        );

        // console.log(response.data.data[0].cuaca);
        const forecasts = response.data.data[0].cuaca; // flatten nested arrays
        if (!forecasts || forecasts.length === 0) {
          return message.reply(`⚠️ No weather data found for ${city}.`);
        }

        // Sort forecasts by datetime
        forecasts.sort(
          (a, b) => new Date(a.local_datetime) - new Date(b.local_datetime),
        );

        // Find the current and next 3 forecasts
        const upcoming = forecasts.slice(0, 4);

        if (upcoming.length === 0) {
          return message.reply(`⚠️ No upcoming forecast data for ${city}.`);
        }

        const current = upcoming[0][0];
        const next3 = upcoming[0].slice(1, 5);

        const weatherEmbed = new EmbedBuilder()
          .setColor("#00BFFF")
          .setTitle(`🌤 Weather for ${wilayah.kelurahan}, ${wilayah.provinsi}`)
          .setDescription(
            `**${current.weather_desc_en} (${current.weather_desc})**`,
          )
          .setThumbnail(`${current.image.replace(/ /g, "%20")}`)
          .addFields(
            {
              name: "🌡️ Temperature",
              value: `${current.t}°C`,
              inline: true,
            },
            {
              name: "💧 Humidity",
              value: `${current.hu}%`,
              inline: true,
            },
            {
              name: "🌬️ Wind",
              value: `${current.ws} m/s (${current.wd})`,
              inline: true,
            },
            {
              name: "🕒 Forecast Time",
              value: new Date(current.local_datetime).toLocaleString("id-ID"),
              inline: false,
            },
            {
              name: "📈 Visibility",
              value: current.vs_text || "> 10 km",
              inline: true,
            },
            {
              name: "📅 Data Updated",
              value: new Date(current.analysis_date).toLocaleString("id-ID"),
              inline: true,
            },
            {
              name: `🔮 Next ${next3.length} Forecasts`,
              value: next3
                .map(
                  (f) =>
                    `🕒 **${new Date(f.local_datetime).toLocaleTimeString(
                      "id-ID",
                      {
                        hour: "2-digit",
                        minute: "2-digit",
                      },
                    )}** — ${f.weather_desc} (${f.t}°C, 💧${f.hu}%)`,
                )
                .join("\n"),
              inline: false,
            },
          )
          .setFooter({
            text: "Data source: BMKG | Kingdom of Science",
            iconURL:
              "https://api-apps.bmkg.go.id/storage/icon/cuaca/cerah-pm.svg",
          })
          .setTimestamp();

        message.channel.send({ embeds: [weatherEmbed] });
      } catch (err) {
        console.error("❌ Weather fetch error:", err.message);
        message.reply("⚠️ Failed to fetch weather data from BMKG.");
      }
      break;
    case "askai":
      if (args.length === 0) {
        return message.reply(
          "💬 Please ask me something, e.g. `!askai Why does Jakarta flood often?`",
        );
      }

      const prompt = args.join(" ");
      message.channel.send("🤖 Thinking with science...");
      const aiResponse = await askAI(prompt);
      console.log(aiResponse);
      if (aiResponse.length > 1800) {
        sendLongMessage(
          message.channel,
          `💬 **AI (truncated to fit Discord limits):** ${aiResponse}`,
        );
      } else {
        message.channel.send(`💬 **AI:** ${aiResponse}`);
      }
      break;

    case "fact":
      if (facts.length === 0)
        return message.reply("⚙️ No facts available yet.");
      const randomFact = facts[Math.floor(Math.random() * facts.length)];
      message.channel.send(`📘 **Science Fact:** ${randomFact}`);
      break;

    case "drstone":
      const quote = quotes[Math.floor(Math.random() * quotes.length)];
      message.channel.send(`🎌 ${quote}`);
      break;

    default:
      message.reply("⚙️ Unknown command. Try `!help`.");
  }
});

client.login(process.env.DISCORD_TOKEN);
