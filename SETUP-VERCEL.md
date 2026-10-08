# Put the drill library on Vercel

This is the setup for saving practice plans to an account. The pages themselves stay plain HTML. Sign-in and saved plans run as small Vercel functions in the `api` folder, with the plans stored in a Neon Postgres database.

Until you finish this setup, the site works the same way it does today. The Sign in button stays hidden, including on GitHub Pages. Share links keep working with no account.

You still add and edit drills in this repo. The website does not have a way for coaches to add drills.

Set aside a quiet half hour. You will click through Vercel, Google, Resend, Neon, and DNSimple. The site is its own Vercel project at `https://hockey.derekbraid.com`. Leave the main derekbraid.com project alone. There is no rewrite to paste there.

## 1. Import this repo into Vercel

1. Sign in at [vercel.com](https://vercel.com) with the same account that owns the main derekbraid.com project.
2. Click **Add New… → Project**.
3. Import **DeBraid/hockey-skills-and-drills**. If GitHub asks for permission, allow this repo.
4. On the import screen, set:
   - **Framework Preset:** Other
   - **Build Command:** `python3 scripts/build_site.py`
   - **Output Directory:** `public`
   - **Install Command:** `npm install` (the default is fine)

The build writes the site into `public/`. Vercel should publish that folder, not the repository root. The root also contains the API source, tests, and the database schema. If **Project Settings** has an override for the output directory, set that override to `public` as well. A value saved in the dashboard wins over `vercel.json`.
5. Do not deploy yet. Open **Environment Variables** on that same screen and add the variables in the table in step 6. You can also deploy now and add the variables afterward, then redeploy. A redeploy is required after any variable change.

The project gets an address like `https://hockey-skills-and-drills.vercel.app`. Copy that address. You need it for Google. The address coaches use is `https://hockey.derekbraid.com`, added in step 7.

## 2. Add the Neon database

1. In the Vercel project, open the **Storage** tab, or **Integrations / Marketplace**.
2. Add **Neon** (Postgres).
3. Create a database when it asks. The name can be `hockey-skills`.
4. Accept the defaults. Vercel adds a variable named `DATABASE_URL` to this project. You do not type that value yourself.
5. Open the Neon dashboard from the button Vercel shows (it is the database’s own website, still signed in through Vercel).

### Run the migration

The migration creates the tables for coaches and for saved plans. Do this once.

**Easiest path, no terminal:**

1. In Neon, open **SQL Editor**.
2. Open `db/migrations/001_init.sql` from this repo (on GitHub, click the file, then Raw, and copy the whole file).
3. Paste it into the SQL editor and click **Run**. Then do the same with `db/migrations/002_rate_limits.sql`.
4. You should see success, not a red error. Running either file a second time is safe.

**Terminal path,** if you already use a terminal:

```bash
npm install
npx vercel env pull .env.local
npm run migrate
```

`npm run migrate` reads `DATABASE_URL` and applies `db/migrations/001_init.sql`.

## 3. Google sign-in

1. Open [Google Cloud Console](https://console.cloud.google.com/) and pick or create a project. The name can be `Hockey Skills`.
2. Go to **APIs & Services → OAuth consent screen**. Choose **External**. Fill in the app name `Hockey Skills & Drills` and your email as the support email. Save.
3. If the app is in **Testing**, add yourself (and any coach who should sign in before you publish it) under **Test users**. When you are ready for every coach, publish the app. Publishing a screen that only asks for email and name does not need a long review.
4. Go to **APIs & Services → Credentials → Create credentials → OAuth client ID**.
5. Application type: **Web application**. Name: `Hockey Skills & Drills`.
6. **Authorized JavaScript origins.** Add both, with no path on the end:

   - `https://hockey-skills-and-drills.vercel.app`
   - `https://hockey.derekbraid.com`

   If Vercel gave the project a different `.vercel.app` address, use that one instead of the first line.

7. **Authorized redirect URIs.** Add both, exactly, with no trailing slash:

   - `https://hockey-skills-and-drills.vercel.app/api/auth/callback/google`
   - `https://hockey.derekbraid.com/api/auth/callback/google`

8. Create the client. Copy the **Client ID** and **Client secret**. Those are `AUTH_GOOGLE_ID` and `AUTH_GOOGLE_SECRET`.

## 4. Email sign-in with Resend

Google is one way in. The other way is a link sent by email. [Resend](https://resend.com) sends that mail from derekbraid.com.

1. Create a Resend account.
2. Add the domain **derekbraid.com**.
3. Resend shows DNS records (usually a TXT record for SPF or DKIM, and a CNAME). Add those records wherever derekbraid.com’s DNS is managed (often Vercel DNS, or the registrar). Copy the name and value exactly. Do not invent the values. They are different for every account.
4. Wait until Resend shows the domain as **Verified**. This can take a few minutes, sometimes longer.
5. Create an **API key**. Copy it. That is `AUTH_RESEND_KEY`.
6. Choose a from address on that domain, for example `plans@derekbraid.com`. The env value needs a name and the address:

   `Hockey Skills & Drills <plans@derekbraid.com>`

   That whole string is `EMAIL_FROM`.

## 5. Make AUTH_SECRET

This is a long random password the site uses to protect sign-in cookies. It is not a password you type later.

On a Mac, open Terminal and run:

```bash
openssl rand -base64 32
```

Copy the line it prints. That is `AUTH_SECRET`. If you do not have Terminal, use a password manager to generate a random string at least 32 characters long. Do not use a word, a team name, or anything you have used elsewhere.

## 6. Every environment variable

In the Vercel project: **Settings → Environment Variables**. Add each name for **Production**. Add them for **Preview** too if you want sign-in on preview links. After saving, open **Deployments** and redeploy the latest one so the new values are picked up.

| Name | Where you get it | Example shape |
| --- | --- | --- |
| `DATABASE_URL` | Added for you when you connect Neon in step 2. Do not invent it. | `postgres://…neon.tech/…` |
| `AUTH_SECRET` | The random string from step 5 | a long random line |
| `AUTH_GOOGLE_ID` | Google client ID from step 3 | `123-abc.apps.googleusercontent.com` |
| `AUTH_GOOGLE_SECRET` | Google client secret from step 3 | `GOCSPX-…` |
| `AUTH_RESEND_KEY` | Resend API key from step 4 | `re_…` |
| `EMAIL_FROM` | A from address on the verified domain | `Hockey Skills & Drills <plans@derekbraid.com>` |
| `CANONICAL_HOST` | Type this exactly | `hockey.derekbraid.com` |

Do **not** add `BASE_PATH`. The site is the whole address `hockey.derekbraid.com`, not a folder on derekbraid.com. If `BASE_PATH` is already set, delete it and redeploy.

`CANONICAL_HOST` is the address coaches type. The plain `….vercel.app` address keeps working too, which is why Google has two redirect URIs.

Do **not** add `EMAIL_DELIVERY` on Vercel. That switch is only for local tests. If it is set to `console`, email links are printed in the logs instead of sent.

You do not need `AUTH_URL`. Leaving it unset lets both `hockey.derekbraid.com` and the `.vercel.app` address work.

## 7. Custom domain in DNSimple

Coaches use `https://hockey.derekbraid.com`. That name points straight at this Vercel project. Do not add a rewrite on the main derekbraid.com project.

1. In this Vercel project, open **Settings → Domains**.
2. Add `hockey.derekbraid.com`. Vercel will say it needs a DNS record.
3. In DNSimple, open the `derekbraid.com` zone. Add a **CNAME**:
   - Name: `hockey`
   - Target: `cname.vercel-dns.com`
4. Save. Wait until Vercel shows the domain as valid. This can take a few minutes.
5. Open `https://hockey.derekbraid.com`. You should see the drill library.

Sign-in routes such as `/api/auth/signin/google` are already wired in this repo’s `vercel.json`. Leave those rules in place when you deploy.

## 8. Try it

1. Open `https://YOUR-PROJECT.vercel.app`. You should see **Sign in** in the header. If you do not, the variables are missing or the project was not redeployed.
2. Open **Sign in**. Try **Continue with Google**, then try the email link in a second browser or a private window.
3. Build a small practice plan and tap **Save**. Open **My plans**. The plan should be listed. Open it, rename it, duplicate it, and delete the copy.
4. Copy a share link, open it in a private window, and confirm the drills show up with no sign-in.
5. Then open `https://hockey.derekbraid.com/` and sign in there too. Saving on that address should work, and the address should stay on hockey.derekbraid.com.

The first time you sign in on a phone that already had a plan in the browser, the site asks if you want to save that browser plan to the account. **Not now** leaves it only on that phone.

## 9. Turn off GitHub Pages

Do this only after step 8 works on hockey.derekbraid.com.

1. On GitHub, open this repo.
2. **Settings → Pages**.
3. Under **Build and deployment**, set **Source** to **None** (Disable).
4. Save.

GitHub Pages does not run accounts. Publishing the repository root also publishes the API source and the database schema. Leave Pages off. Coaches should use `https://hockey.derekbraid.com/`.

Do not point `hockey.derekbraid.com` at this repo’s Pages site. The domain stays on this Vercel project, through the DNSimple CNAME in step 7. If you ever want a static fallback, publish the `public/` folder the build creates, not the repository root.

## If something is off

**No Sign in button.** You are probably still on GitHub Pages, or the Vercel deploy does not have the variables yet. Redeploy after saving variables. On the vercel.app address, Sign in should show even before the custom domain is added.

**Google says redirect_uri mismatch.** Copy the URI from the Google error and add it under Authorized redirect URIs. The two you want are listed in step 3. No trailing slash.

**The email never arrives.** In Resend, the domain must say Verified, and `EMAIL_FROM` must use that domain. Check spam. Resend’s logs show whether the message was sent.

**Google sign-in shows a Vercel “404: NOT_FOUND”.** Redeploy from the latest `main`. This repo’s `vercel.json` sends `/api/auth/…` to the sign-in function. Do not remove those rules.

**Sign-in works on the vercel.app address but not on hockey.derekbraid.com.** Check `CANONICAL_HOST` is `hockey.derekbraid.com`, and that `BASE_PATH` is not set, then redeploy. In DNSimple the `hockey` CNAME must point at `cname.vercel-dns.com`. The browser address should stay on hockey.derekbraid.com.

**Save says it could not reach the database.** The migration in step 2 did not run, or `DATABASE_URL` is missing. Run the SQL file in Neon and redeploy.

**A coach can see someone else’s plan.** They should not. Plans are loaded with the signed-in coach’s id on the server. If you ever see that, do not keep using that deploy. Write down the address and the time.

## Security settings only you can change

These are not in the repo. After this deploy:

1. **Vercel → Project Settings → Build and Deployment.** Output Directory must be `public`. If an override is saved in the dashboard, change it to `public` and redeploy. The dashboard value wins over `vercel.json`.
2. **Vercel → Deployment Protection.** Turn protection on for Preview deployments. Do not copy production `DATABASE_URL`, `AUTH_SECRET`, or the Google and Resend secrets into Preview unless those preview URLs are locked. A public preview is another copy of the app.
3. **Google Cloud → OAuth consent screen.** Keep the scopes to email, profile, and openid. While the app is in Testing, only listed test users can sign in. Publish the consent screen when any coach should be able to use Google. Add both redirect URIs from step 3 if they are not there yet.
4. **Neon.** The integration role owns the database. When you want a smaller app login, follow the comments in `db/least-privilege.sql`, then point the Vercel `DATABASE_URL` at that role and redeploy. Keep running migrations as the owner in the SQL editor.
5. **Sign in again** on hockey.derekbraid.com after this deploy. The session cookie name changed, so the old cookie stops working. You do not need to rotate `AUTH_SECRET`, the Google client secret, the Resend key, or `DATABASE_URL` because of this review. Nothing secret was found in git history.
6. Do not set `EMAIL_DELIVERY` on Vercel. That switch prints magic links instead of sending them, and production ignores it.

A coach deletes their account from **My plans**. That removes the profile and every saved plan.
