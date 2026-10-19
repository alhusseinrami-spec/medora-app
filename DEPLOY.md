# Deploying Medora to Vercel, and connecting Nour

This takes about 30 minutes. You do the parts that involve accounts and secrets. Claude does the code and the Nour wiring.
Never paste a key or password into chat. Generate it, put it straight into Vercel or ElevenLabs, and keep a copy in your password manager.

## 1. Put the code on GitHub

1. Create a free GitHub account if you don't have one, and an **empty private repository** called `medora-app`. Don't add a README.
2. Connect GitHub to Claude at https://claude.ai/connect-github and give it access to that repository.
3. Tell Claude the repository name (for example `rami-alhussein/medora-app`). Claude pushes the code.

## 2. Create the Vercel project and database

1. Sign in at https://vercel.com with your GitHub account. The free Hobby plan is enough to start.
2. **Add New → Project**, pick `medora-app`, then **Deploy**. The first build fails because there is no database yet. That's expected.
3. In the project, open **Storage → Create Database → Neon (Serverless Postgres)**. Choose the **Frankfurt (eu-central-1)** region, which is closest to Beirut, and connect it to the project for all environments.
   Neon fills in `DATABASE_URL` and `DATABASE_URL_UNPOOLED` for you.

## 3. Add the secrets

Open **Settings → Environment Variables** and add these for Production. For each random value, run `openssl rand -base64 48` on a Mac or Linux terminal, or use your password manager's generator (48+ characters).

| Name | Value |
|---|---|
| `APP_ENCRYPTION_KEY` | A new random value. Save a copy: if it's lost, everyone must set up two-step sign-in again. |
| `CRON_SECRET` | A new random value. Vercel Cron sends it automatically. |
| `NOUR_API_KEY` | A new random value. You'll paste the same value into ElevenLabs in step 5. |
| `APP_URL` | The address Vercel shows, for example `https://medora-app.vercel.app`, or your own domain later. |
| `ANTHROPIC_API_KEY` | Optional. Your key from console.anthropic.com turns on the in-app assistant. Without it the app works and the assistant shows "not connected". |

Then go to **Deployments → ⋯ → Redeploy**. The build runs the database migrations, then builds the app.

## 4. Create your owner account

Open the site straight away and create the owner account, then set up two-step sign-in with your authenticator app. The setup screen disappears once one account exists, so do this before sharing the link.

Check `https://<your-site>/api/health`. It should say `"db": "up"`.

## 5. Connect Nour

1. In ElevenLabs, go to **Agents → Settings → Secrets** (workspace secrets), add a secret named `medora_nour_key`, and paste the `NOUR_API_KEY` value.
2. Tell Claude the site address. Claude adds three tools to Nour that use that secret:
   - **Today's briefing:** schedule, clashes, tasks due, reminders, items waiting for approval.
   - **Look up:** a person, company, task, meeting or reminder by name.
   - **Queue a task or reminder:** after you confirm it aloud. It lands in the Approval Center as "Waiting for approval", and nothing is created until you approve it.

Nour can't approve anything, send email, delete records or see accounting data through this connection.

## 6. Phone notifications

Reminders, and items Nour queues for approval, can arrive on your phone even when Medora is closed.

1. **Every-5-minute check:** on GitHub, open the repository's **Settings → Secrets and variables → Actions → New repository secret**. Name it `CRON_SECRET` and paste the same value as `CRON_SECRET` in Vercel. The **Reminders tick** workflow then calls the app every 5 minutes (GitHub sometimes starts it a few minutes late).
2. **On iPhone (iOS 16.4 or later):** open the site in Safari, tap **Share → Add to Home Screen**, then open Medora from the Home Screen icon. Go to **Settings → Phone notifications → Enable**, allow notifications, and tap **Send test**.
3. **On Android or a computer:** open **Settings → Phone notifications → Enable** in Chrome, Edge or Firefox.

Turn it on separately on each device. The push keys are created automatically and stored encrypted in the database, so there is nothing else to set up.

## Good to know

- **Reminders on the free plan:** Vercel Hobby runs cron jobs once a day. The GitHub **Reminders tick** workflow (step 6) runs them every 5 minutes instead, and they are also delivered every 30 seconds whenever the app is open in a browser.
- **Backups:** Neon keeps point-in-time history (24 hours on the free plan, longer on paid plans). Use **Settings → Export** in the app for your own copy.
- **Own domain:** Vercel **Settings → Domains**. Update `APP_URL` afterwards and redeploy.
- **Rotating a key:** change the value in Vercel and redeploy. For `NOUR_API_KEY`, update the ElevenLabs secret too.
