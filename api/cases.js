// api/cases.js (Vercel Serverless Function)
export default async function handler(req, res) {
  // 安全のため、POSTメソッド以外は弾く
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method Not Allowed' });
  }

  try {
    const { action, ...data } = req.body;
    
    // ステップ1で設定した環境変数を安全に取得（ブラウザからは見えません）
    const GAS_URL = process.env.GAS_URL;
    const GAS_PASSWORD = process.env.GAS_PASSWORD;

    if (!GAS_URL || !GAS_PASSWORD) {
      return res.status(500).json({ success: false, error: 'サーバーの環境変数が設定されていません' });
    }

    // GASに渡すデータをまとめる
    const payload = {
      password: GAS_PASSWORD,
      action: action,
      ...data
    };

    // VercelサーバーからGASへ裏側でPOST送信（CORSエラーは起きません）
    const gasResponse = await fetch(GAS_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const result = await gasResponse.json();
    return res.status(200).json(result);

  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
}  
