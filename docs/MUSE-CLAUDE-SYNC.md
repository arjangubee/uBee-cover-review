# Muse and Claude: working on the same app

How a creator's Muse and uBee's Claude change this app without overwriting each other.

## The repos

- uBee's repo, `arjangubee/uBee-cover-review`, is the app every creator runs. Updates come from here.
- A creator's fork, under her own GitHub account, is where her Muse pushes fix branches. Her fork's `main` stays identical to uBee's.

## The rule, every change

1. Start from a fresh `main`: `git pull --ff-only upstream main`.
2. One branch per change, for example `fix/grievance-receipt`.
3. Run `npm test` before pushing. It must end with UPDATE TEST OK, RENDER TEST OK, ACCOUNTS TEST OK and SMOKE OK.
4. Push the branch to her fork only. No pull request, and never merge into her fork's `main`: a fix merged there blocks her updates.
5. Tell uBee's Claude the branch name. Claude folds it into uBee's dev repo, a second AI reviews it, then it ships to every creator and comes back to her copy as an update.
6. Delete the branch once it's in a release.

## Privacy, the hard rule

No creator-specific data ever goes in a repo: no photos, no Drive folder ids, no names, no emails, no account handles. Creator specifics live in Drive and in the app's local settings only. The public build stays generic.

## Where the live app lives

A creator's Muse space is a separate live copy, built from the repo's files, and it can't update itself. When uBee releases a new version, the app says "Version X is out. Your Muse brings it in.", and her Muse brings it in without being asked (1.13.10). A small Copy the ask link gives her the line for her Muse in case a port was missed, and the app says when it's copied, or how to copy it by hand if the app blocks copying. The Muse rebuilds or ports the space from uBee's latest `main` and keeps her data. The steps are in AGENTS.md under Updates.
