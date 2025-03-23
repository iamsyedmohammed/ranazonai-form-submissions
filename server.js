const express = require('express');
const nodemailer = require('nodemailer');
const bodyParser = require('body-parser');
const cors = require('cors');
const { google } = require('googleapis');
const path = require('path');
require('dotenv').config();

const app = express();
app.set('trust proxy', 1); // Fix for rate limiter behind proxy

const fs = require('fs');

// Ensure config directory exists
const configPath = path.join(__dirname, 'config');
if (!fs.existsSync(configPath)) {
  fs.mkdirSync(configPath);
}

// Write credentials.json from environment variable
const credentialsFilePath = path.join(configPath, 'credentials.json');
console.log('GOOGLE_CREDENTIALS_JSON loaded?', !!process.env.GOOGLE_CREDENTIALS_JSON);

fs.writeFileSync(credentialsFilePath, process.env.GOOGLE_CREDENTIALS_JSON);

// Set this so your code below still works
process.env.GOOGLE_APPLICATION_CREDENTIALS = credentialsFilePath;

const PORT = process.env.PORT || 3000;


const rateLimit = require('express-rate-limit');

const limiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 4, // limit each IP to 3 requests per windowMs
  message: { success: false, message: 'Too many requests. Please try again shortly.' }
});

app.use('/send-email', limiter); // apply only to email route

app.use(cors());
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

// Function to save data to Google Sheet
async function saveToGoogleSheet(data) {
  const auth = new google.auth.GoogleAuth({
    keyFile: path.join(__dirname, 'credentials.json'),
    scopes: ['https://www.googleapis.com/auth/spreadsheets']
  });

  const client = await auth.getClient();
  const sheets = google.sheets({ version: 'v4', auth: client });

  const spreadsheetId = '1FJT6weANfRF9cirFM9-dD3KOy3r_mVy0f1YwMlSsAqg';


  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: 'Sheet1!A:H',
    valueInputOption: 'USER_ENTERED',
    requestBody: {
      values: [[
        new Date().toISOString(),
        data.Name,
        data.email,
        data.Phone,
        data.City,
        data.Company,
        data.Services,
        data.Message
      ]]
    }
  });
}


function renderSocialFooter() {
    return `
      <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;" />
      <p style="margin-bottom: 6px;">Connect with us:</p>
      <p>
        <a href="https://facebook.com/yourpage" style="margin-right: 10px;">
          <img src="https://cdn-icons-png.flaticon.com/24/733/733547.png" alt="Facebook" />
        </a>
        <a href="https://instagram.com/yourprofile" style="margin-right: 10px;">
          <img src="https://cdn-icons-png.flaticon.com/24/2111/2111463.png" alt="Instagram" />
        </a>
        <a href="https://x.com/ranazonai" style="margin-right: 10px;">
          <img src="https://cdn-icons-png.flaticon.com/24/3670/3670151.png" alt="Twitter" />
        </a>
        <a href="https://github.com/ranazonai" style="margin-right: 10px;">
          <img src="https://cdn-icons-png.flaticon.com/24/733/733553.png" alt="GitHub" />
        </a>
        <a href="https://www.linkedin.com/in/ranazonai/">
          <img src="https://cdn-icons-png.flaticon.com/24/174/174857.png" alt="LinkedIn" />
        </a>
      </p>
    `;
  }
  

// Email + Google Sheets handler
const { body, validationResult } = require('express-validator');

app.post('/send-email', [
  body('Name').trim().notEmpty().withMessage('Name is required.'),
  body('email').isEmail().withMessage('Valid email is required.'),
  body('Phone').isMobilePhone().withMessage('Valid phone number required.'),
  body('City').notEmpty(),
  body('Company').notEmpty(),
  body('Services').notEmpty(),
  body('Message').notEmpty()
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, errors: errors.array() });
  }


  const {
    Name,
    email,
    Phone,
    City,
    Company,
    Services,
    Message
  } = req.body;
  
    const transporter = nodemailer.createTransport({
      host: 'smtp.hostinger.com',
      port: 465,
      secure: true,
      auth: {
        user: process.env.MY_EMAIL,
        pass: process.env.MY_PASSWORD
      }
    });
  
    let isReturningUser = false;
  
    try {
      // 1. Check if email exists in sheet
      const auth = new google.auth.GoogleAuth({
        keyFile: process.env.GOOGLE_APPLICATION_CREDENTIALS,

        scopes: ['https://www.googleapis.com/auth/spreadsheets']
      });
  
      const client = await auth.getClient();
      const sheets = google.sheets({ version: 'v4', auth: client });
  
      const spreadsheetId = '1FJT6weANfRF9cirFM9-dD3KOy3r_mVy0f1YwMlSsAqg';
  
      const existing = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range: 'Sheet1!C2:C', // Email column
      });
  
      const emailList = existing.data.values?.flat() || [];
      isReturningUser = emailList.includes(email);
  
      // 2. Save to sheet
      await sheets.spreadsheets.values.append({
        spreadsheetId,
        range: 'Sheet1!A:H',
        valueInputOption: 'USER_ENTERED',
        requestBody: {
          values: [[
            new Date().toISOString(),
            Name,
            email,
            Phone,
            City,
            Company,
            Services,
            Message
          ]]
        }
      });
  
      console.log(`✔️ ${isReturningUser ? 'Returning' : 'New'} user logged to Google Sheet`);
    } catch (err) {
      console.error('Google Sheets Error:', err);
    }
  
    // 3. Email to YOU
    const mailToYou = {
        from: `"${Name}" <${process.env.MY_EMAIL}>`,
        to: process.env.MY_EMAIL,
        subject: `New Enquiry from ${Name}`,
        html: `
          <div style="font-family: Arial, sans-serif; color: #333; padding: 20px;">
            <img src="https://i.imgur.com/yqLwbgN.png" alt="Ranazonai Logo" style="height: 50px; margin-bottom: 20px;" />
      
            <h2 style="color: #444;">New Enquiry Received</h2>
      
            <table cellpadding="6" cellspacing="0" style="border-collapse: collapse;">
              <tr><td><strong>Name:</strong></td><td>${Name}</td></tr>
              <tr><td><strong>Email:</strong></td><td>${email}</td></tr>
              <tr><td><strong>Phone:</strong></td><td>${Phone}</td></tr>
              <tr><td><strong>City:</strong></td><td>${City}</td></tr>
              <tr><td><strong>Company:</strong></td><td>${Company}</td></tr>
              <tr><td><strong>Services:</strong></td><td>${Services}</td></tr>
              <tr><td><strong>Message:</strong></td><td>${Message}</td></tr>
            </table>
      
            <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;" />
      
            <p style="font-size: 12px; color: #888;">
              Ranazonai Internal Notification – ${new Date().toLocaleString()}
            </p>
          </div>
        `
      };
      
  
    // 4. Auto-response to user
    const confirmationMessage = isReturningUser
      ? `
        <div style="font-family: Arial, sans-serif; color: #333; padding: 20px;">
      <img src="https://i.imgur.com/yqLwbgN.png" alt="Ranazonai Logo" style="height: 50px; margin-bottom: 20px;" />

      <p>Hi ${Name},</p>
      <p>Welcome back, and thank you once again for choosing <strong>Ranazonai</strong>.</p>
      <p>Your continued trust means a lot to us. We’ve received your latest enquiry and will get in touch with you shortly to assist further.</p>
      <p>Should you need anything urgently, our team is available at <a href="mailto:contact@ranazonai.in">contact@ranazonai.in</a>.</p>

      <br>
      <p>Best regards,<br><strong>The Ranazonai Team</strong></p>
      <p style="font-size: 12px; color: #888;">Your growth partners in digital excellence.</p>
        </div>
      `
      : `
        <div style="font-family: Arial, sans-serif; color: #333; padding: 20px;">
      <img src="https://i.imgur.com/yqLwbgN.png" alt="Ranazonai Logo" style="height: 50px; margin-bottom: 20px;" />

      <p>Hi ${Name},</p>
      <p>Thank you for reaching out to <strong>Ranazonai</strong>. We’re delighted to connect with you and appreciate your interest in our services.</p>
      <p>Your enquiry has been received, and one of our senior consultants will be in touch shortly to better understand your goals and explore how we can support your business growth.</p>
      <p>If your request is time-sensitive, feel free to contact us directly at <a href="mailto:contact@ranazonai.in">contact@ranazonai.in</a>.</p>

      <br>
      <p>Warm regards,<br><strong>The Ranazonai Team</strong></p>
      <p style="font-size: 12px; color: #888;">Igniting ideas. Driving results.</p>

<hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;" />

<p style="margin-bottom: 6px;">Connect with us:</p>

    </div>
      `;
  
    const confirmationMail = {
      from: `"Ranazonai" <${process.env.MY_EMAIL}>`,
      to: email,
      subject: isReturningUser
        ? `Welcome back, ${Name}!`
        : `Thanks for getting in touch, ${Name}`,
      html: `
        ${confirmationMessage}
        <br>
        ${renderSocialFooter()}
      `
    };
  
    // 5. Send both emails
    try {
      await transporter.sendMail(mailToYou);
      await transporter.sendMail(confirmationMail);
      res.status(200).json({ success: true, message: 'Email sent successfully!' });
    } catch (err) {
      console.error('❌ Email Error:', err);
      res.status(500).json({ success: false, message: 'Email failed to send.' });
    }
  });
  

app.listen(PORT, () => {
  console.log(`🚀 Server is running on port ${PORT}`);
});
