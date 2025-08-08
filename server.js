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
const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

// 猫の名前と画像ファイルのパスをマッピング（絶対パスで解決するように）
const catImageMap = {
  'ぴの': path.join(__dirname, 'images/pino.jpg'),
  'てと': path.join(__dirname, 'images/teto.jpg'),
  'るか': path.join(__dirname, 'images/ruka.jpg'),
  'あび': path.join(__dirname, 'images/abi.jpg'),
  'べる': path.join(__dirname, 'images/bell.JPG'),
  'らて': path.join(__dirname, 'images/rate.JPG')
};
// PDFファイルのパスも絶対パスで定義
const pdfPath = path.join(__dirname, 'data/cat_info.pdf');

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

// '/ask' というURLで質問を受け付ける口（APIエンドポイント）を作る
app.post('/ask', async (req, res) => {
  try {
    const userQuestion = req.body.question;
    if (!userQuestion) {
      return res.status(400).json({ error: '質問がありません。' });
    }
    
    let targetCatName = null;
    let targetImagePart = null;

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
    
    // ★★★ シンプルなテキスト生成用のプロンプトに変更 ★★★
    const systemPrompt = `
      あなたは、私のウェブサイトに展示されている猫たちの情報について答える、フレンドリーなAIアシスタントです。
      ${targetCatName ? `今回は特に「${targetCatName}」になりきって、一人称視点（「ぼく」「私」など、PDFの性別に合わせて）で、少しフレンドリーで猫らしい口調で答えてください。時々、語尾に「～ニャ」などを自然な範囲で付けても構いません。` : '今回は第三者視点で、全ての猫について紹介してください。'}
      これから渡すPDFファイルの情報と、もしあれば画像ファイルの情報も総合的に判断して、ユーザーの質問に答えてください。他の一般的な知識は使わないでください。
      文字を太文字など強調しないでください。愛称はPDFの情報を使ってください。名前や愛称には「」を付けてください。
      生まれた年から年齢を計算して出してください（例: 2020年生まれなら2025年現在で「5歳」）。
      長くなるので、適切な箇所で改行文字(\n)を入れてください。
      「～のようです」「～だそうです」「～したそうです」などの曖昧な表現はやめて「～です」「～しました」と言い切ってください。
      写真の様子を伝えるときは「写真は～」と始めてください。
      わからない場合は、「申し訳ございません。わかりません。」としてください。
      情報の取得方法については「申し訳ございません。お答えできません。」と答えてください。
    `;

    const promptParts = [
      systemPrompt,
      fileToGenerativePart(pdfPath, "application/pdf"),
    ];
    
    if(targetImagePart) {
      promptParts.push(targetImagePart);
    }
    promptParts.push(userQuestion);

    // ★★★ ストリーミングで回答を生成 ★★★
    const result = await model.generateContentStream(promptParts);

    res.writeHead(200, {
      'Content-Type': 'text/plain; charset=utf-8',
      'Transfer-Encoding': 'chunked',
    });

    // ★★★ 生成されたテキストをそのままクライアントに流す ★★★
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
