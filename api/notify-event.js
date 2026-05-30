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

  const { event, emails } = req.body;
  if (!event || !emails || !Array.isArray(emails) || emails.length === 0) {
    return res.status(400).json({ error: 'Event details and recipient emails are required' });
  }

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn('RESEND_API_KEY environment variable is not configured. Logging event notifications to console.');
    console.log(`[EVENT NOTIFICATION LOG] Title: ${event.title}, Recipients count: ${emails.length}`);
    return res.status(200).json({ 
      success: true, 
      message: 'Event notification logged to console (RESEND_API_KEY not configured)' 
    });
  }

  const fromEmail = process.env.EMAIL_FROM || 'onboarding@resend.dev';
  const siteUrl = req.headers.origin || 'https://saidharmasamrakshanapremakuteeram.qzz.io';
  const eventLink = `${siteUrl}/events?id=${event.id}`;

  const categoryLabels = {
    bhajan: 'Bhajan',
    seva: 'Seva Activity',
    study: 'Study Circle',
    celebration: 'Special Celebration'
  };
  const categoryLabel = categoryLabels[event.category] || event.category;

  // Format date nicely
  let formattedDate = event.date;
  try {
    const d = new Date(event.date);
    if (!isNaN(d.getTime())) {
      formattedDate = d.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    }
  } catch (err) {
    console.warn('Date formatting failed:', err);
  }

  try {
    // Send email using Resend API. Since the free tier only allows sending to verified domain or owner,
    // we send a single request with Bcc or send it sequentially.
    // To be most reliable and compliant with Resend free tier rules (which allows bcc to multiple recipients if domain verified),
    // we send the email to the sender from email, and bcc the recipients list.
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        from: `Sathya Sai Trust <${fromEmail}>`,
        to: fromEmail, // Send to self
        bcc: emails, // Send to all registered members in BCC
        subject: `New Event: ${event.title} (${categoryLabel})`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eee; border-radius: 8px;">
            <div style="text-align: center; border-bottom: 2px solid #e8954a; padding-bottom: 20px;">
              <h1 style="color: #c46a1a; margin: 0;">New Event Scheduled</h1>
              <p style="color: #666; font-size: 14px; margin: 5px 0 0 0;">Sathya Sai Prema Kuterram</p>
            </div>
            <div style="padding: 20px 0; color: #333; line-height: 1.6;">
              <p>Sai Ram,</p>
              <p>A new event has been organized by the trust and listed on our schedule. Below are the details:</p>
              
              <div style="background-color: #fdf2e9; padding: 15px; border-left: 4px solid #e8954a; margin: 20px 0; border-radius: 4px;">
                <h3 style="margin-top: 0; color: #c46a1a; font-size: 18px;">${event.title}</h3>
                <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
                  <tr>
                    <td style="padding: 4px 0; font-weight: bold; width: 100px; color: #666;">Category:</td>
                    <td style="padding: 4px 0;">${categoryLabel}</td>
                  </tr>
                  <tr>
                    <td style="padding: 4px 0; font-weight: bold; color: #666;">Date:</td>
                    <td style="padding: 4px 0;">${formattedDate}</td>
                  </tr>
                  <tr>
                    <td style="padding: 4px 0; font-weight: bold; color: #666;">Time:</td>
                    <td style="padding: 4px 0;">${event.time || 'N/A'}</td>
                  </tr>
                  <tr>
                    <td style="padding: 4px 0; font-weight: bold; color: #666;">Venue:</td>
                    <td style="padding: 4px 0;">${event.venue || 'N/A'}</td>
                  </tr>
                </table>
              </div>

              <p><strong>Description:</strong><br>${event.description || 'No description provided.'}</p>

              <div style="background-color: #f5f5f5; padding: 12px; margin-top: 20px; border-radius: 4px; font-size: 13px; color: #555;">
                <strong>Event Coordinator:</strong> ${event.coordinator || 'N/A'}<br>
                <strong>Contact:</strong> ${event.contact || 'N/A'}
              </div>

              <div style="text-align: center; margin: 30px 0;">
                <a href="${eventLink}" style="background-color: #e8954a; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; font-weight: bold; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">View and Register / Volunteer</a>
              </div>
            </div>
            <div style="border-top: 1px solid #eee; padding-top: 20px; text-align: center; color: #888; font-size: 12px;">
              <p>You received this email because you registered as a member of Sathya Sai Prema Kuterram.</p>
              <p>&copy; 2026 Sathya Sai Prema Kuterram. All rights reserved.</p>
            </div>
          </div>
        `
      })
    });

    const resData = await response.json();
    if (!response.ok) {
      throw new Error(resData.message || 'Failed to send event notification via Resend');
    }

    return res.status(200).json({ success: true, data: resData });
  } catch (error) {
    console.error('Event notification dispatch error:', error);
    return res.status(500).json({ error: error.message });
  }
};
