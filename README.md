# Cabinet

Quickly explore and view local photos and videos in a browser over the network
with a single command and zero configuration.

- Supports multiple user profiles with authentication.
- Browse, manage, and view photos.
- Stream and favourite videos privately.

## Requirements

- [Node.js >= 7 and npm >= 5.2.](https://nodejs.org)
- Modern browser or IE 11.

## Quick start

```bash
npx @wzlin/cabinet \
  --library /path/to/library/folder
  --port PORT_TO_LISTEN_ON
```

## Options

|Name|Default|Description|
|---|---|---|
|`--library`|**Required**|Absolute path to the folder containing photos and videos (including in subdirectories).|
|`--users`||Absolute path to the folder containing user profiles. Required for authentication.|
|`--port`|Random port between 1024 and 9999 (inclusive).|Port to listen on.|
|`--video`|`mp4,m4v`|Comma-separated file extensions to consider as video files.|
|`--photo`|`png,gif,jpg,jpeg,bmp,svg,tif,tiff,webp`|Comma-separated file extensions to consider as photo files.|
|`--key`||Absolute path to HTTPS private key file in PEM format. Required for HTTPS.|
|`--cert`||Absolute path to HTTPS certificate file in PEM format. Required for HTTPS.|
|`--dh`||Absolute path to HTTPS Diffie-Hellman parameters file. Not required for HTTPS.|

## Installing as CLI

`npx` downloads and runs the latest version on every invocation. This makes it convenient to occasionally run the server without having to worry about installing or updating, but might not be efficient when run often on a single machine.

It's possible to install this npm package globally:

```bash
npm i -g @wzlin/cabinet
```

Once installed, the server can be started without invoking `npx`:

```bash
cabinet --library /lib --users /user ...
```

npm creates executable aliases in the global bin folder. For the command to be found, ensure that the folder has been added to `PATH`. The folder's path can be found using `npm bin -g`.

To update in the future:

```bash
npm update -g @wzlin/cabinet
```

To uninstall:

```bash
npm uninstall -g @wzlin/cabinet
```

## Profiles and authentication

It's possible to enable users. Using the app will require logging in, and users can have personal data such as favourite videos.

**NOTE:** This feature is provided for convenience, not hardened security.

**WARNING:** It's advised to enable HTTPS when using this feature, as otherwise passwords will be sent over the network in plaintext.

### Creating a new user

Users are stored as JSON files in a folder; the name is not relevant, although it might be convenient to name them as `USERNAME.json`. 

To set up users for the first time, create a folder for storing user profiles, and pass the absolute path to it as the `--users` argument.

To create a new user, create a new `.json` file with the following structure:

```json
{
 "username": USERNAME,
 "password": BCRYPT_PASSWORD_HASH,
 "favouriteVideos": []
}
```

Passwords are hashed using bcrypt. A convenient way to generate the hash for a password is to use `npx @wzlin/bcrypt-cli`.

### Behaviour

- If there are no users, authentication will be disabled; the server will act like as if `--users` was never provided.
- Having two users with the same username is undefined behaviour.

## Client app

- To browse and watch videos, visit `/videos`.
- To explore and view photos, visit `/photos`.

Going to `/` will show links to view photos or videos.

### Videos

#### Keyboard shortcuts

|Shortcut|Action|
|---|---|
|`Space` or `k`|Play/pause.|
|`j`|Rewind 5 seconds.|
|`l`|Fast-forward 5 seconds.|
|`Left`|Rewind 10 seconds.|
|`Right`|Fast-forward 10 seconds.|
|`0`|Rewind to start.|
|`s`|Stop.|
|`a`|Previous video.|
|`d`|Next video.|
|`Ctrl/Cmd`+`f`|Focus search input.|
|`Esc` while search input is focused|Stop focusing search input.|
|`Esc`|Exit fullscreen.|

### Photos

#### Keyboard shortcuts

|Shortcut|Action|
|---|---|
|`Left`|Previous photo.|
|`Right`|Next photo.|
|`Ctrl/Cmd`+`f`|Focus search input.|
|`Esc` while search input is focused|Stop focusing search input.|
|`Esc`|Exit preview.|
