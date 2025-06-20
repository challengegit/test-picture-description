// 【真実を暴くためのコード】
const myApiKey = process.env.GEMINI_API_KEY;

console.log('--- APIキーの真の値を表示します ---');
console.log(myApiKey);
console.log('------------------------------------');

if (myApiKey && myApiKey.startsWith('AIza')) {
  console.log('判定: 値は、本物のAPIキーのようです。');
} else {
  console.log('判定: 警告！これはAPIキーではありません！ おそらくcurlコマンドです！');
}