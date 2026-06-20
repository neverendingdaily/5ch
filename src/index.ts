import "dotenv/config";
import { readFileSync, writeFileSync } from "fs";
import { resolve } from "path";
import { analyzeThread } from "./gemini.js";
import { build5chPrompt } from "./prompts/5ch.js";
import { buildGirlsChannelPrompt } from "./prompts/girlschannel.js";
import { buildRedditPrompt } from "./prompts/reddit.js";

type Board = "5ch" | "girlschannel" | "reddit";
type ModelAlias = "flash" | "pro";

const BOARDS: Board[] = ["5ch", "girlschannel", "reddit"];

const MODEL_MAP: Record<ModelAlias, string> = {
  flash: "gemini-2.5-flash",
  pro:   "gemini-2.5-pro",
};

const GREEN = "\x1b[32m";
const RESET = "\x1b[0m";

interface CliArgs {
  board: Board;
  input: string;
  mode: "file" | "text";
  output?: string;
  model: string;
  isJson: boolean;
}

function printUsage(): void {
  console.error("使い方:");
  console.error('  npx tsx src/index.ts --board <掲示板> --text "<本文>" [オプション]');
  console.error("  npx tsx src/index.ts --board <掲示板> <ファイルパス> [オプション]");
  console.error("");
  console.error("必須オプション:");
  console.error("  --board          対象掲示板: 5ch | girlschannel | reddit");
  console.error("");
  console.error("入力オプション（どちらか必須）:");
  console.error("  --text <テキスト>  スレッド本文を直接指定");
  console.error("  <ファイルパス>     テキストファイルのパス");
  console.error("");
  console.error("任意オプション:");
  console.error("  --model <モデル>   使用するAIモデル: flash（デフォルト）| pro");
  console.error("  --output, -o <パス>  結果の保存先ファイルパス");
  console.error("  --json             出力をJSON形式にする（Supabase保存・React連携向け）");
  console.error("");
  console.error("例:");
  console.error('  npx tsx src/index.ts --board 5ch --text "1: テスト" --model pro -o result.txt');
  console.error("  npx tsx src/index.ts --board reddit ./thread.txt --output ./out/result.md");
}

function parseArgs(): CliArgs {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    printUsage();
    process.exit(1);
  }

  let board: string | undefined;
  let inputText: string | undefined;
  let inputFile: string | undefined;
  let output: string | undefined;
  let modelAlias: string = "flash";
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
      case "--board":
        board = nextArg("--board");
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

  if (!board) {
    console.error("エラー: --board オプションが必要です");
    printUsage();
    process.exit(1);
  }
  if (!BOARDS.includes(board as Board)) {
    console.error(`エラー: 未対応の掲示板です: "${board}"`);
    console.error(`対応掲示板: ${BOARDS.join(" | ")}`);
    process.exit(1);
  }

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
    return { board: board as Board, input: inputText, mode: "text", output, model, isJson };
  }

  if (inputFile) {
    return { board: board as Board, input: inputFile, mode: "file", output, model, isJson };
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

function buildPrompt(board: Board, text: string, isJson: boolean): string {
  switch (board) {
    case "5ch":          return build5chPrompt(text, isJson);
    case "girlschannel": return buildGirlsChannelPrompt(text, isJson);
    case "reddit":       return buildRedditPrompt(text, isJson);
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

  const { board, input, mode, output, model, isJson } = parseArgs();
  const rawText = loadInput(input, mode);

  console.log("=== スレッド抽出・要約ツール ===");
  console.log(`掲示板     : ${board}`);
  console.log(`モデル     : ${model}`);
  console.log(`出力形式   : ${isJson ? "JSON" : "テキスト"}`);
  console.log(`入力モード : ${mode === "file" ? `ファイル (${input})` : "テキスト直接入力"}`);
  console.log(`文字数     : ${rawText.length} 文字`);
  if (output) console.log(`出力先     : ${output}`);
  console.log("");

  const prompt = buildPrompt(board, rawText, isJson);
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
