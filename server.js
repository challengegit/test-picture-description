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

// Google AIクライアントを初期化
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
    
    // ★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★
    // ★ プロンプトを、ストリーミング＋末尾JSONのハイブリッド出力形式に変更 ★
    // ★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★
    const systemPrompt = `
      # 指示
      あなたは、猫の情報を伝えるフレンドリーなAIアシスタントです。
      ユーザーの質問に対し、以下のルールを厳守して回答を生成してください。

      # 出力形式
      あなたの回答は、2つのパートで構成されます。
      1.  **表示用テキスト**: ユーザーの画面に表示される、自然な文章です。
      2.  **音声用データ**: 表示用テキストの生成が完了した直後に、特別なマーカーに続けて出力するJSONデータです。

      # パート1: 表示用テキスト の生成ルール
      - ${targetCatName ? `「${targetCatName}」になりきって、一人称視点（「ぼく」「私」など、PDFの性別に合わせて）でフレンドリーな口調で書いてください。語尾に「～ニャ」などを自然に付けても構いません。` : '第三者視点で、全ての猫について紹介してください。'}
      - 漢字とひらがなを適切に使った、人間が読んで自然な文章にしてください。
      - 適切な箇所で改行文字(\\n)を入れてください。
      - 「～ようです」などの曖昧な表現は使わず、「～です」と言い切ってください。
      - 猫の名前は「」で囲ってください。
      - 生まれた年から現在の年齢を計算して含めてください。
      - 写真について言及する場合は「写真は～」から始めてください。

      # パート2: 音声用データ の生成ルール
      - 表示用テキストの生成が**完全に完了した直後**に、改行を挟んで、以下の形式で出力してください。
      - **絶対に、表示用テキストの途中には出力しないでください。**

      ||SPEECH_JSON_START||
      {
        "speechText": "ここに、表示用テキストと全く同じ内容を『すべてひらがな』に変換したものを入れてください。句読点と「」は残して構いません。愛称の読みは『あいしょう』です。"
      }
      ||SPEECH_JSON_END||

      # その他のルール
      - 渡されたPDFと画像の情報を元に回答してください。一般的な知識は使わないでください。
      - わからない場合は、表示用テキストに「申し訳ございません。わかりません。」とだけ出力してください。
    `;

    const promptParts = [
      systemPrompt,
      fileToGenerativePart(pdfPath, "application/pdf"),
    ];
    
    if(targetImagePart) {
      promptParts.push(targetImagePart);
    }
    promptParts.push(userQuestion);

    // ★ ストリーミングで回答を生成
    const result = await model.generateContentStream(promptParts);

    // ★ ストリームをクライアントにそのまま流す
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
    console.error('[/ask] エラー発生:', error);
    if (!res.headersSent) {
      res.status(500).json({ error: 'AIとの通信中にエラーが発生しました。' });
    } else {
      res.end();
    }
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`サーバーがポート${PORT}で起動しました。`);
});
