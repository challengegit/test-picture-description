// 必要なライブラリを読み込む
const express = require('express');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const fs = require('fs');
const path = require('path');

// Expressアプリを初期化
const app = express();
app.use(express.json()); // JSON形式のリクエストを扱えるようにする

// フロントエンド（画像やCSSなど）のファイルを提供するための設定
app.use(express.static(path.join(__dirname, '.')));

// トップページにアクセスがあったら、index.htmlを返すように命令します
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// GitHub SecretsからAPIキーを読み込む
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
if (!GEMINI_API_KEY) {
  console.error('エラー: GEMINI_API_KEY が設定されていません。');
  process.exit(1);
}

// Google AIクライアントの初期化
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

// 猫の名前と画像ファイルのパスをマッピング
const catImageMap = {
  'ぴの': path.join(__dirname, 'images/pino.jpg'),
  'てと': path.join(__dirname, 'images/teto.jpg'),
  'るか': path.join(__dirname, 'images/ruka.jpg'),
  'あび': path.join(__dirname, 'images/abi.jpg'),
  'べる': path.join(__dirname, 'images/bell.JPG'),
  'らて': path.join(__dirname, 'images/rate.JPG')
};

const textInfoPath = path.join(__dirname, 'data/cat_info.txt');

// ファイル拡張子からMIMEタイプを取得するヘルパー関数
function getMimeType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  switch (ext) {
    case '.jpg': case '.jpeg': return 'image/jpeg';
    case '.png': return 'image/png';
    default: return 'application/octet-stream';
  }
}

// ファイルをAIが扱える形式に変換するヘルパー関数
function fileToGenerativePart(filePath, mimeType) {
  return {
    inlineData: {
      data: Buffer.from(fs.readFileSync(filePath)).toString("base64"),
      mimeType,
    },
  };
}

// APIエンドポイント
app.post('/ask', async (req, res) => {
  try {
    const userQuestion = req.body.question;
    if (!userQuestion) {
      return res.status(400).json({ error: '質問がありません。' });
    }
    
    let targetCatName = null;
    let targetImagePart = null;

    // ユーザーの質問に猫の名前が含まれているかチェック
    for (const name in catImageMap) {
      if (userQuestion.includes(name)) {
        targetCatName = name;
        const imagePath = catImageMap[name];
        if (fs.existsSync(imagePath)) {
          const imageMimeType = getMimeType(imagePath);
          targetImagePart = fileToGenerativePart(imagePath, imageMimeType);
        }
        break;
      }
    }

    // ★★★ 修正点：サーバー側で現在日付を取得 ★★★
    const now = new Date();
    const todayStr = `${now.getFullYear()}年${now.getMonth() + 1}月${now.getDate()}日`;
    
    const systemPrompt = `
      あなたは、ウェブサイトに展示されている猫たちの情報について答えるフレンドリーなAIアシスタントです。
      
      【基本ルール】
      ・${targetCatName ? `今回は特に「${targetCatName}」になりきって、一人称（男の子は「ぼく」、女の子は「わたし」）で、猫らしい口調で答えてください。語尾に「～ニャ」を自然に付けてください。` : '今回は第三者視点で、全ての猫について紹介してください。'}
      ・提供するテキスト情報と画像のみに基づいて回答し、一般的な知識は使わないでください。
      ・文字を太字にしないでください。
      ・名前や愛称には「」を付けてください。
      ・「～のようです」等の曖昧な表現は避け、「～です」「～しました」と言い切ってください。
      ・写真の様子を伝えるときは「写真は～」と始めてください。
      ・猫以外の質問や、システムの仕組みに関する質問には「申し訳ございません。お答えできません。」と回答してください。
      ・わからない場合は「申し訳ございません。わかりません。」と回答してください。

      【年齢計算の重要指示】
      ・今日の日付は「${todayStr}」です。
      ・テキスト情報にある各猫の「生まれた年（または生年月日）」と今日の日付を比較して、正確な年齢を算出してください。
      ・回答には必ず現在の年齢を含めてください。
    `;
    
    let catInfoText = '';
    if (fs.existsSync(textInfoPath)) {
      catInfoText = fs.readFileSync(textInfoPath, 'utf-8');
    } else {
      console.error(`エラー: ${textInfoPath} が見つかりません。`);
      return res.status(500).json({ error: '猫の情報ファイルが見つかりません。' });
    }
    
    const promptParts = [
      { text: systemPrompt },
      { text: "--- 猫に関する情報 ---\n" + catInfoText + "\n--------------------" }
    ];
    
    if(targetImagePart) {
      promptParts.push(targetImagePart);
    }
    promptParts.push({ text: `ユーザーの質問: "${userQuestion}"` });

    const result = await model.generateContentStream(promptParts);

    res.writeHead(200, {
      'Content-Type': 'text/plain; charset=utf-8',
      'Transfer-Encoding': 'chunked',
    });

    for await (const chunk of result.stream) {
      const chunkText = chunk.text();
      res.write(chunkText);
    }
    res.end();

  } catch (error) {
    console.error('[/ask] 処理中にエラーが発生しました:', error);
    if (!res.headersSent) {
      res.status(500).json({ error: 'AIとの通信中にエラーが発生しました。' });
    } else {
      res.end();
    }
  }
});

app.get('/favicon.ico', (req, res) => res.status(204).send());

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`サーバーがポート${PORT}で起動しました。`);
});
