import "dotenv/config";
import { readFileSync, writeFileSync } from "fs";
import { resolve } from "path";
import { analyzeThread } from "./gemini.js";
import { build5chBasicPrompt } from "./prompts/5ch-basic.js";
import { build5chBlogPrompt } from "./prompts/5ch-blog.js";
import { buildYoutubePrompt } from "./prompts/youtube.js";
import { buildAmazonPrompt } from "./prompts/amazon.js";
import { buildYahooXPrompt } from "./prompts/yahoo-x.js";
import { buildGirlsChannelPrompt } from "./prompts/girlschannel.js";
import { buildRedditBasicPrompt } from "./prompts/reddit-basic.js";
import { buildRedditAffilPrompt } from "./prompts/reddit-affil.js";
import { buildHackernewsPrompt } from "./prompts/hackernews.js";

type AnalysisType =
  | "5ch-basic"
  | "5ch-blog"
  | "youtube"
  | "amazon"
  | "yahoo-x"
  | "girlschannel"
  | "reddit-basic"
  | "reddit-affil"
  | "hackernews";

type ModelAlias = "flash" | "pro";

const ANALYSIS_TYPES: AnalysisType[] = [
  "5ch-basic",
  "5ch-blog",
  "youtube",
  "amazon",
  "yahoo-x",
  "girlschannel",
  "reddit-basic",
  "reddit-affil",
  "hackernews",
];

const TYPE_LABELS: Record<AnalysisType, string> = {
  "5ch-basic":    "5ちゃんねる分析・まとめ",
  "5ch-blog":     "まとめサイト記事自動化",
  "youtube":      "YouTube/TikTokコメント分析",
  "amazon":       "Amazon/サービスレビュー分析",
  "yahoo-x":      "Yahoo!/X 対立・議論構造化",
  "girlschannel": "ガールズちゃんねる分析",
  "reddit-basic": "Reddit特化型分析",
  "reddit-affil": "Redditアフィリエイト記事化",
  "hackernews":   "HackerNews/海外テックフォーラム",
};

const MODEL_MAP: Record<ModelAlias, string> = {
  flash: "gemini-2.5-flash",
  pro:   "gemini-2.5-pro",
};

const GREEN = "\x1b[32m";
const RESET = "\x1b[0m";

interface CliArgs {
  analysisType: AnalysisType;
  input: string;
  mode: "file" | "text";
  output?: string;
  model: string;
  isJson: boolean;
}

function printUsage(): void {
  console.error("使い方:");
  console.error('  npx tsx src/index.ts --type <タイプ> --text "<本文>" [オプション]');
  console.error("  npx tsx src/index.ts --type <タイプ> <ファイルパス> [オプション]");
  console.error("");
  console.error("必須オプション:");
  console.error("  --type, -t <タイプ>  分析タイプを指定");
  console.error("");
  console.error("  タイプ一覧:");
  for (const [key, label] of Object.entries(TYPE_LABELS)) {
    console.error(`    ${key.padEnd(16)} ${label}`);
  }
  console.error("");
  console.error("入力オプション（どちらか必須）:");
  console.error('  --text "<テキスト>"  スレッド本文を直接指定');
  console.error("  <ファイルパス>       テキストファイルのパス");
  console.error("");
  console.error("任意オプション:");
  console.error("  --model <モデル>     使用するAIモデル: flash（デフォルト）| pro");
  console.error("  --output, -o <パス>  結果の保存先ファイルパス");
  console.error("  --json               出力をJSON形式にする");
  console.error("");
  console.error("例:");
  console.error('  npx tsx src/index.ts --type youtube --text "コメント1: 神動画 コメント2: 感動した"');
  console.error('  npx tsx src/index.ts -t reddit-basic ./thread.txt --model pro --json -o result.json');
}

function parseArgs(): CliArgs {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    printUsage();
    process.exit(1);
  }

  let analysisTypeRaw: string | undefined;
  let inputText: string | undefined;
  let inputFile: string | undefined;
  let output: string | undefined;
  let modelAlias = "flash";
  let isJson = false;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    const nextArg = (flag: string): string => {
      if (i + 1 >= args.length) {
        console.error(`エラー: ${flag} の後に値が必要です`);
        process.exit(1);
      }
      return args[++i];
    };

    switch (arg) {
      case "--type":
      case "-t":
        analysisTypeRaw = nextArg("--type / -t");
        break;
      case "--text":
        inputText = nextArg("--text");
        break;
      case "--output":
      case "-o":
        output = nextArg("--output / -o");
        break;
      case "--model":
        modelAlias = nextArg("--model");
        break;
      case "--json":
        isJson = true;
        break;
      default:
        if (!arg.startsWith("-")) {
          inputFile = resolve(arg);
        } else {
          console.error(`エラー: 未知のオプション: "${arg}"`);
          printUsage();
          process.exit(1);
        }
    }
  }

  if (!analysisTypeRaw) {
    console.error("エラー: --type オプションが必要です");
    printUsage();
    process.exit(1);
  }
  if (!ANALYSIS_TYPES.includes(analysisTypeRaw as AnalysisType)) {
    console.error(`エラー: 未対応のタイプです: "${analysisTypeRaw}"`);
    console.error(`対応タイプ: ${ANALYSIS_TYPES.join(" | ")}`);
    process.exit(1);
  }
  const analysisType = analysisTypeRaw as AnalysisType;

  if (!(modelAlias in MODEL_MAP)) {
    console.error(`エラー: 未対応のモデルです: "${modelAlias}"`);
    console.error("指定可能なモデル: flash | pro");
    process.exit(1);
  }
  const model = MODEL_MAP[modelAlias as ModelAlias];

  if (inputText !== undefined) {
    if (!inputText) {
      console.error("エラー: --text の後にテキストを指定してください");
      process.exit(1);
    }
    return { analysisType, input: inputText, mode: "text", output, model, isJson };
  }

  if (inputFile) {
    return { analysisType, input: inputFile, mode: "file", output, model, isJson };
  }

  console.error("エラー: 入力テキスト (--text) またはファイルパスを指定してください");
  printUsage();
  process.exit(1);
}

function loadInput(input: string, mode: "file" | "text"): string {
  if (mode === "text") return input;

  try {
    return readFileSync(input, "utf-8");
  } catch {
    console.error(`エラー: ファイルを読み込めません: ${input}`);
    process.exit(1);
  }
}

function buildPrompt(analysisType: AnalysisType, text: string, isJson: boolean): string {
  switch (analysisType) {
    case "5ch-basic":    return build5chBasicPrompt(text, isJson);
    case "5ch-blog":     return build5chBlogPrompt(text, isJson);
    case "youtube":      return buildYoutubePrompt(text, isJson);
    case "amazon":       return buildAmazonPrompt(text, isJson);
    case "yahoo-x":      return buildYahooXPrompt(text, isJson);
    case "girlschannel": return buildGirlsChannelPrompt(text, isJson);
    case "reddit-basic": return buildRedditBasicPrompt(text, isJson);
    case "reddit-affil": return buildRedditAffilPrompt(text, isJson);
    case "hackernews":   return buildHackernewsPrompt(text, isJson);
  }
}

function createSpinner(message: string): { stop: () => void } {
  const frames = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
  let i = 0;
  const timer = setInterval(() => {
    process.stdout.write(`\r${frames[i]} ${message}`);
    i = (i + 1) % frames.length;
  }, 80);

  return {
    stop: () => {
      clearInterval(timer);
      process.stdout.write(`\r${" ".repeat(message.length + 4)}\r`);
    },
  };
}

async function main(): Promise<void> {
  if (!process.env.GEMINI_API_KEY) {
    console.error("エラー: 環境変数 GEMINI_API_KEY が設定されていません（.env ファイルを確認してください）");
    process.exit(1);
  }

  const { analysisType, input, mode, output, model, isJson } = parseArgs();
  const rawText = loadInput(input, mode);

  console.log("=== スレッド抽出・要約ツール ===");
  console.log(`分析タイプ : ${analysisType}（${TYPE_LABELS[analysisType]}）`);
  console.log(`モデル     : ${model}`);
  console.log(`出力形式   : ${isJson ? "JSON" : "テキスト"}`);
  console.log(`入力モード : ${mode === "file" ? `ファイル (${input})` : "テキスト直接入力"}`);
  console.log(`文字数     : ${rawText.length} 文字`);
  if (output) console.log(`出力先     : ${output}`);
  console.log("");

  const prompt = buildPrompt(analysisType, rawText, isJson);
  const spinner = createSpinner("AI が分析中...");
  const startTime = performance.now();

  try {
    const result = await analyzeThread(prompt, model, isJson);
    spinner.stop();

    const elapsed = ((performance.now() - startTime) / 1000).toFixed(2);

    console.log("=== AI 分析結果 ===");
    console.log(result);
    console.log(`\n処理時間: ${elapsed}s`);

    if (output) {
      writeFileSync(output, result, "utf-8");
      console.log(`${GREEN}✅ 結果を ${output} に保存しました${RESET}`);
    }
  } catch (err) {
    spinner.stop();
    const message = err instanceof Error ? err.message : String(err);
    console.error(`\nエラー: API 呼び出しに失敗しました: ${message}`);
    process.exit(1);
  }
}

main();
