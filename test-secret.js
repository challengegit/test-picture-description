// process.envから、設定した名前のSecret（環境変数）を読み込む
const myApiKey = process.env.GEMINI_API_KEY;

if (myApiKey) {
  console.log('成功！ APIキーが読み込めました。');
  // 安全のため、キーの一部だけ表示してみましょう
  console.log('キーの先頭5文字:', myApiKey.substring(0, 5));
} else {
  console.log('失敗... APIキーが見つかりません。');
  console.log('リポジトリのSettings > Secrets > Codespacesで設定を確認してください。');
}
