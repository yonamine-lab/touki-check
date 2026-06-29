export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method Not Allowed' });
  }

  try {
    const { action, ...data } = req.body;
    
    // 💡 環境変数を使わず、ここに直接指定します（裏側なので誰にも見られません）
    const GAS_URL = 'https://script.google.com/a/macros/ecrioffice.com/s/AKfycbzdNspeOCOKy_-NSVYhMPDce3U-WVj3LEldJrNZ3725YAq0u0943LIpmZD8tvCKG3_xCQ/exec';
    const GAS_PASSWORD = 'bmtt7v4d';

    const payload = {
      password: GAS_PASSWORD,
      action: action,
      ...data
    };

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
