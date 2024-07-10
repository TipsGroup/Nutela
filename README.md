# Nutela

This project lets you deploy an update server for [Electron](https://www.electronjs.org) apps with ease: You only need to click a button.

The result will be faster and more lightweight than any other solution out there! :rocket:

- Modern fork of [Hazel](https://github.com/vercel/hazel)
- Built on top of [micro](https://github.com/zeit/micro), the tiniest HTTP framework for Node.js
- Pulls the latest release data from [GitHub Releases](https://help.github.com/articles/creating-releases/) and caches it in memory
- Refreshes the cache every **15 minutes** (custom interval [possible](#options))
- When asked for an update, it returns the link to the GitHub asset directly (saves bandwidth)
- Supports **macOS** and **Windows** apps

## Usage

Deploy to your favorite cloud provider.

Once it's deployed, paste the deployment address into your code (please keep in mind that updates should only occur in the production version of the app, not while developing):

```js
const { app, autoUpdater } = require('electron')

const server = <your-deployment-url>
const url = `${server}/update/${process.platform}/${app.getVersion()}`

autoUpdater.setFeedURL({ url })
```

That's it! :white_check_mark:

From now on, the auto updater will ask your Nutela deployment for updates!

## Options

The following environment variables can be used optionally:

- `INTERVAL`: Refreshes the cache every x minutes ([restrictions](https://developer.github.com/changes/2012-10-14-rate-limit-changes/)) (defaults to 15 minutes)
- `PRE`: When defined with a value of `1`, only pre-releases will be cached
- `TOKEN`: Your GitHub token (for private repos)
- `PRIVATE_BASE_URL`: The server's URL (for private repos - when running on [Vercel](https://vercel.com), this field is filled with the URL of the deployment automatically)

## Statistics

Since Nutela routes all the traffic for downloading the actual application files to [GitHub Releases](https://help.github.com/articles/creating-releases/), you can use their API to determine the download count for a certain release.

As an example, check out the [latest Hyper release](https://api.github.com/repos/vercel/hyper/releases/latest) and search for `mac.zip`. You'll find a release containing a sub property named `download_count` with the amount of downloads as its value.

## Routes

### /

Displays an overview page showing the cached repository with the different available platforms and file sizes. Links to the repo, releases, specific cached version and direct downloads for each platform are present.

### /download

Automatically detects the platform/OS of the visitor by parsing the user agent and then downloads the appropriate copy of your application.

If the latest version of the application wasn't yet pulled from [GitHub Releases](https://help.github.com/articles/creating-releases/), it will return a message and the status code `404`. The same happens if the latest release doesn't contain a file for the detected platform.

### /download/:platform

Accepts a platform (like "darwin" or "win32") to download the appropriate copy your app for. I generally suggest using either `process.platform` ([more](https://nodejs.org/api/process.html#process_process_platform)) or `os.platform()` ([more](https://nodejs.org/api/os.html#os_os_platform)) to retrieve this string.

If the cache isn't filled yet or doesn't contain a download link for the specified platform, it will respond like `/`.

### /update/:platform/:version

Checks if there is an update available by reading from the cache.

If the latest version of the application wasn't yet pulled from [GitHub Releases](https://help.github.com/articles/creating-releases/), it will return the `204` status code. The same happens if the latest release doesn't contain a file for the specified platform.

### /update/win32/:version/RELEASES

This endpoint was specifically crafted for the Windows platform (called "win32" [in Node.js](https://nodejs.org/api/process.html#process_process_platform)).

Since the [Windows version](https://github.com/Squirrel/Squirrel.Windows) of Squirrel (the software that powers auto updates inside [Electron](https://www.electronjs.org)) requires access to a file named "RELEASES" when checking for updates, this endpoint will respond with a cached version of the file that contains a download link to a `.nupkg` file (the application update).
