const JSON_INSTRUCTION =
  "\n【重要】出力は必ず、以下のキーを持つ有効なJSON形式（Markdownのコードブロックを含まない純粋なJSON文字列）のみを出力してください。キーの構成は適宜最適なものを設計してください。";

export function buildRedditAffilPrompt(text: string, isJson: boolean = false): string {
  return `
以下の【対象テキスト】を、Reddit JSON解析＆アフィリエイト記事化の要件で処理してください。

【対象テキスト】
${text}${isJson ? JSON_INSTRUCTION : ""}
`;
}
