# Sreejith Trade Paradox

A trading journal with login. Static site (no build step), Supabase for accounts and data, Vercel for hosting.

Target address: `https://sreejithtradeparadox.vercel.app`
(Vercel project names must be lowercase. If the name is taken, Vercel will tell you; pick a close one such as `sreejith-trade-paradox`.)

## Files

- `index.html` the app (login, dashboard, journal, calendar, analytics, backtest, account)
- `backtest.js` the backtest engine and CSV reader
- `api/candles.js` a Vercel function that fetches Yahoo Finance prices (Vercel picks it up automatically)
- `package.json` tells Vercel to use Node 18 or newer
- `config.js` your Supabase URL and key
- `schema.sql` the database table and security rules

## 1. Supabase (login and database), about 5 minutes

1. Go to supabase.com, sign up, and create a new project. Save the database password somewhere.
2. Open **SQL Editor**, click **New query**, paste everything from `schema.sql`, and press **Run**.
3. Open **Project Settings -> API**. Copy the **Project URL** and the **anon public** key into `config.js`.
4. Open **Authentication -> URL Configuration**:
   - Site URL: `https://sreejithtradeparadox.vercel.app`
   - Redirect URLs: add the same address (and `http://localhost:3000` if you test locally).
5. Optional while testing: **Authentication -> Providers -> Email**, turn off "Confirm email" so sign-ups log in immediately. Turn it back on before sharing the site.

## 2. Put the code on GitHub

1. Create a new repository on github.com (private is fine).
2. Upload everything from the zip, keeping the `api` folder as it is: `index.html`, `backtest.js`, `config.js`, `package.json`, `schema.sql`, `README.md` and `api/candles.js`. On GitHub, "Add file -> Upload files" accepts folders when you drag them in on a computer. On a phone, use "Create new file" and type `api/candles.js` as the name to create the folder, then paste the code.

## 3. Deploy on Vercel

1. Sign in at vercel.com with your GitHub account.
2. **Add New -> Project**, pick your repository.
3. Project name: `sreejithtradeparadox`. Framework preset: **Other**. Leave build and output settings empty.
4. Press **Deploy**. Your site will be live at the `.vercel.app` address in under a minute.

Every time you push a change to GitHub, Vercel redeploys automatically.

## Backtesting

Open the **Backtest** tab, pick one or two assets, choose a strategy and press **Run backtest**.

- **Binance (crypto):** free, no key. Prices load straight from the browser.
- **Yahoo Finance:** stocks, indices and forex. Nifty 50 is `^NSEI`, Bank Nifty is `^NSEBANK`, NSE stocks end in `.NS` such as `RELIANCE.NS`. Needs the `api/candles.js` function, so it works on the deployed site and not when you open `index.html` as a local file. Intraday history is limited: 1m about 7 days, 5m to 30m about 60 days, 1h about 2 years. Yahoo is an unofficial source and can change without notice.
- **CSV upload:** columns Date, Open, High, Low, Close (Yahoo and most broker exports work). Dates like `2026-10-08`, `08-10-2026 09:15` and Unix timestamps are understood.
- **Strategies:** SMA crossover, EMA crossover, RSI mean reversion, channel breakout. Optional stop loss, take profit, position size, fees and short trades.
- **Compare two assets:** tick "Compare two assets" to get two candlestick charts with entry and exit markers, a return comparison chart (strategy vs buy and hold for each asset) and a side-by-side results table.

How trades are simulated: a signal is read when a candle closes and the trade is entered at the next candle's open. Slippage is not modelled. If one candle touches both the stop and the target, the stop is assumed to hit first. Fees are charged on entry and exit.

## Google login (optional)

1. In Google Cloud Console, create an OAuth client (type: Web application). Add the redirect URL shown in Supabase under **Authentication -> Providers -> Google**.
2. Paste the client ID and secret into that Supabase provider screen and enable it.
3. Set `GOOGLE_LOGIN: true` in `config.js` and redeploy.

## Using your own domain later

In Vercel: **Project -> Settings -> Domains -> Add**. Vercel shows the DNS records to add at your registrar. Then update the Site URL and Redirect URLs in Supabase to the new address.

## Notes

- Each person only sees their own trades. This is enforced by the database rules in `schema.sql`, not by the page.
- New accounts start with example trades so the charts are not empty. They disappear when the first real trade is saved, or with "Clear examples".
- Supabase's free plan pauses projects after a week of no activity. Opening the project dashboard wakes it up.
- Supabase's built-in email sender has a low hourly limit. For many users, add your own SMTP provider under **Authentication -> SMTP Settings**.
