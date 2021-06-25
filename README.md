# Cabinet

Quickly explore and view local photos and videos in a browser over the network
with a single command and zero configuration.

- Browse, manage, and view photos.
- Stream and favourite videos privately.

## Requirements

- [Node.js 7 or higher.](https://nodejs.org)
- Modern browser.

## Quick start

```bash
npx @wzlin/cabinet \
  --library /path/to/library/folder
  --port PORT_TO_LISTEN_ON
```

## Options

|Name|Default|Description|
|---|---|---|
|`--library`|Current working directory.|Absolute path to the folder containing photos and videos (including in subdirectories).|
|`--port`|Random port assigned by OS.|Port to listen on.|
|`--video`|`mp4,m4v,webm`|Comma-separated file extensions to consider as video files.|
|`--photo`|`png,gif,jpg,jpeg,bmp,svg,tif,tiff,webp`|Comma-separated file extensions to consider as photo files.|
|`--key`||Absolute path to HTTPS private key file in PEM format. Required for HTTPS.|
|`--cert`||Absolute path to HTTPS certificate file in PEM format. Required for HTTPS.|
|`--dh`||Absolute path to HTTPS Diffie-Hellman parameters file. Optional for HTTPS.|

## Installing as CLI

`npx` downloads and runs the latest version on every invocation. This makes it convenient to occasionally run the server without having to worry about installing or updating, but might not be efficient when run often on a single machine.

It's possible to install this npm package globally:

```bash
npm i -g @wzlin/cabinet
```

Once installed, the server can be started without invoking `npx`:

```bash
cabinet --library /lib ...
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
