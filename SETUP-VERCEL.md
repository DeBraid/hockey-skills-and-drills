# Put the drill library on Vercel

This is the setup for saving practice plans to an account. The pages themselves stay plain HTML. Sign-in and saved plans run as small Vercel functions in the `api` folder, with the plans stored in a Neon Postgres database.

Until you finish this setup, the site works the same way it does today. The Sign in button stays hidden, including on GitHub Pages. Share links keep working with no account.

You still add and edit drills in this repo. The website does not have a way for coaches to add drills.

Set aside a quiet half hour. You will click through Vercel, Google, Resend, and Neon, then paste one rewrite into the main derekbraid.com project.

## 1. Import this repo into Vercel

1. Sign in at [vercel.com](https://vercel.com) with the same account that owns the main derekbraid.com project.
2. Click **Add New… → Project**.
3. Import **DeBraid/hockey-skills-and-drills**. If GitHub asks for permission, allow this repo.
4. On the import screen, set:
   - **Framework Preset:** Other
   - **Build Command:** `python3 scripts/build_site.py`
   - **Output Directory:** leave this as the project root. If the box is empty, leave it empty. If Vercel filled in a folder, clear it so the root is used. Do not set it to `public` or `dist`.
   - **Install Command:** `npm install` (the default is fine)
5. Do not deploy yet. Open **Environment Variables** on that same screen and add the variables in the table in step 7. You can also deploy now and add the variables afterward, then redeploy. A redeploy is required after any variable change.

The project gets an address like `https://hockey-skills-and-drills.vercel.app`. Yours may have a suffix. Copy that address. You need it for Google.

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
3. Paste it into the SQL editor and click **Run**.
4. You should see success, not a red error. Running it a second time is safe.

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

   - `https://YOUR-PROJECT.vercel.app`
   - `https://derekbraid.com`

7. **Authorized redirect URIs.** Add both, exactly:

   - `https://YOUR-PROJECT.vercel.app/api/auth/callback/google`
   - `https://derekbraid.com/hockey-skills-and-drills/api/auth/callback/google`

   Replace `YOUR-PROJECT` with the Vercel address from step 1. The second one must include `/hockey-skills-and-drills`. There is no trailing slash.

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
| `BASE_PATH` | Type this exactly | `/hockey-skills-and-drills` |
| `CANONICAL_HOST` | Type this exactly | `derekbraid.com` |

`BASE_PATH` is the folder on derekbraid.com. `CANONICAL_HOST` tells sign-in to send coaches back to derekbraid.com when they came in through that address. The plain `….vercel.app` address keeps working too, which is why Google has two redirect URIs.

Do **not** add `EMAIL_DELIVERY` on Vercel. That switch is only for local tests. If it is set to `console`, email links are printed in the logs instead of sent.

You do not need `AUTH_URL`. Leaving it unset lets both the Vercel address and derekbraid.com work.

## 7. Rewrite on the main derekbraid.com project

The drill library is its own Vercel project. The main derekbraid.com project should pass `/hockey-skills-and-drills` through to it. The address in the browser stays `derekbraid.com/hockey-skills-and-drills`.

In the **main** derekbraid.com repo, edit `vercel.json`. If that file already has a `"rewrites"` list, add these three objects inside that list. Do not remove what is already there. If the file has no rewrites yet, the file can be:

```json
{
  "rewrites": [
    {
      "source": "/hockey-skills-and-drills",
      "destination": "https://YOUR-PROJECT.vercel.app"
    },
    {
      "source": "/hockey-skills-and-drills/",
      "destination": "https://YOUR-PROJECT.vercel.app/"
    },
    {
      "source": "/hockey-skills-and-drills/:path*",
      "destination": "https://YOUR-PROJECT.vercel.app/:path*"
    }
  ]
}
```

Replace `YOUR-PROJECT.vercel.app` with the real Vercel address from step 1. Deploy the main project after saving.

This is a rewrite, not a redirect. After it works, the browser bar still says `derekbraid.com/hockey-skills-and-drills`, and it does not jump to the vercel.app address.

## 8. Try it

1. Open `https://YOUR-PROJECT.vercel.app`. You should see **Sign in** in the header. If you do not, the variables are missing or the project was not redeployed.
2. Open **Sign in**. Try **Continue with Google**, then try the email link in a second browser or a private window.
3. Build a small practice plan and tap **Save**. Open **My plans**. The plan should be listed. Open it, rename it, duplicate it, and delete the copy.
4. Copy a share link, open it in a private window, and confirm the drills show up with no sign-in.
5. Then open `https://derekbraid.com/hockey-skills-and-drills/` and sign in there too. Saving on that address should work, and the address should stay on derekbraid.com.

The first time you sign in on a phone that already had a plan in the browser, the site asks if you want to save that browser plan to the account. **Not now** leaves it only on that phone.

## 9. Turn off GitHub Pages

Do this only after step 8 works on derekbraid.com.

1. On GitHub, open this repo.
2. **Settings → Pages**.
3. Under **Build and deployment**, set **Source** to **None** (Disable).
4. Save.

GitHub Pages does not run accounts. Leaving it on can keep serving an older copy. Coaches should use `https://derekbraid.com/hockey-skills-and-drills/`. The `….github.io` address will stop.

Do not point a custom domain at this repo’s Pages site. derekbraid.com stays on the main Vercel project. This repo is only reached through the rewrite.

## If something is off

**No Sign in button.** You are probably still on GitHub Pages, or the Vercel deploy does not have the variables yet. Redeploy after saving variables. On the vercel.app address, Sign in should show even before the rewrite exists.

**Google says redirect_uri mismatch.** Copy the URI from the Google error and add it under Authorized redirect URIs. The two you want are listed in step 3. No trailing slash.

**The email never arrives.** In Resend, the domain must say Verified, and `EMAIL_FROM` must use that domain. Check spam. Resend’s logs show whether the message was sent.

**Sign-in works on the vercel.app address but not on derekbraid.com.** Check `BASE_PATH` is `/hockey-skills-and-drills` and `CANONICAL_HOST` is `derekbraid.com`, then redeploy this project. On the main project, the rule must be a rewrite. If the browser jumps to the vercel.app address, it is a redirect and the cookie will not stick to derekbraid.com.

**Save says it could not reach the database.** The migration in step 2 did not run, or `DATABASE_URL` is missing. Run the SQL file in Neon and redeploy.

**A coach can see someone else’s plan.** They should not. Plans are loaded with the signed-in coach’s id on the server. If you ever see that, do not keep using that deploy. Write down the address and the time.
