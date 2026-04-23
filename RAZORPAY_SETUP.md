# Razorpay Integration Guide for Vibes Outing

## Step 1: Get Your API Keys
1. Go to Razorpay Dashboard → **Account & Settings** → **API Keys**
2. Click **"Reveal Test API Keys"** (or Generate if first time)
3. Copy your `key_id` and `key_secret`
4. Paste them in the `.env` file (see below)

## Step 2: Create .env file
Create a `.env` file in the project root:
```
RAZORPAY_KEY_ID=rzp_test_Se9OEEMjdd4axG
RAZORPAY_KEY_SECRET=ItUYQU33uv3eOKt78j7wesvh
```

## Step 3: Test Flow
1. Start server: `node server.js`
2. Open http://localhost:3000
3. Sign up → Browse outings → Click "Book Now"
4. Razorpay checkout popup will open
5. Use test card: `4111 1111 1111 1111`, any future expiry, any CVV

## Test Cards (Razorpay Test Mode)
| Card Number         | Description     |
|---------------------|-----------------|
| 4111 1111 1111 1111 | Visa (Success)  |
| 5267 3181 8797 5449 | MC (Success)    |

## Test UPI
- Use `success@razorpay` for successful UPI payment

## Going Live
1. Complete KYC on Razorpay dashboard
2. Get live keys
3. Replace test keys in `.env`
4. Change `RAZORPAY_KEY_ID` in `.env` to `rzp_live_...`
