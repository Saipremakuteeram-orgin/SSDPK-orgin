module.exports = async (req, res) => {
  // CORS header configuration
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    return res.status(450).json({ error: 'Method not allowed' });
  }

  const { email, name } = req.body;
  if (!email) {
    return res.status(400).json({ error: 'Email is required' });
  }

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn('RESEND_API_KEY environment variable is not configured. Logging welcome email to console.');
    console.log(`[WELCOME EMAIL LOG] To: ${email}, Name: ${name}`);
    return res.status(200).json({ 
      success: true, 
      message: 'Welcome email logged to console (RESEND_API_KEY not configured)' 
    });
  }

  const fromEmail = process.env.EMAIL_FROM || 'onboarding@resend.dev';

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        from: `Sathya Sai Trust <${fromEmail}>`,
        to: email,
        subject: 'Welcome to Sathya Sai Trust!',
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eee; border-radius: 8px;">
            <div style="text-align: center; border-bottom: 2px solid #e8954a; padding-bottom: 20px;">
              <h1 style="color: #c46a1a; margin: 0;">Sathya Sai Trust</h1>
              <p style="color: #666; font-size: 14px; margin: 5px 0 0 0;">Love All, Serve All</p>
            </div>
            <div style="padding: 20px 0; color: #333; line-height: 1.6;">
              <p>Dear <strong>${name || 'Devotee'}</strong>,</p>
              <p>Sai Ram! We are delighted to welcome you as a registered member of the <strong>Sathya Sai Prema Kuterram</strong> digital platform.</p>
              <p>With your new digital account, you can access your digital membership card, keep track of upcoming bhajans, study circles, and volunteer for community seva activities.</p>
              <p>To view your digital membership card, simply log in to your dashboard:</p>
              <div style="text-align: center; margin: 30px 0;">
                <a href="${req.headers.origin || 'https://saidharmasamrakshanapremakuteeram.qzz.io'}/login.html" style="background-color: #e8954a; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; font-weight: bold; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">Go to Dashboard</a>
              </div>
              <p>If you have any questions or would like to volunteer for our active projects, feel free to reply directly to this email.</p>
            </div>
            <div style="border-top: 1px solid #eee; padding-top: 20px; text-align: center; color: #888; font-size: 12px;">
              <p>&copy; 2026 Sathya Sai Prema Kuterram. All rights reserved.</p>
            </div>
          </div>
        `
      })
    });

    const resData = await response.json();
    if (!response.ok) {
      throw new Error(resData.message || 'Failed to send welcome email via Resend');
    }

    return res.status(200).json({ success: true, data: resData });
  } catch (error) {
    console.error('Welcome email dispatch error:', error);
    return res.status(500).json({ error: error.message });
  }
};
