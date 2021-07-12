# Cabinet

Quickly explore and view local photos, music, and videos in a browser over the network
with a single command and zero configuration.

- View and play all formats, even ones not browser- or streaming-friendly.
- Works on any device with a modern browser; no app install needed.
- Comes with a beautiful, smooth, glass-inspired UI, designed for all inputs.
- Transparently detects, previews, transcodes, and caches, only when needed.

## Requirements

- [Node.js](https://nodejs.org)
- [Bento4](https://www.bento4.com)
- [fdkaac](https://github.com/nu774/fdkaac)
- [ffmpeg](https://ffmpeg.org)
- Any modern browser

## Quick start

```bash
npx @wzlin/cabinet
```

<details>
<summary><strong>Advanced options</strong></summary>

|Name|Default|Description|
|---|---|---|
|`--library`|Current working directory.|Absolute path to the folder containing photos and videos (including in subdirectories).|
|`--port`|Random port assigned by OS.|Port to listen on.|
|`--sslkey`||Absolute path to HTTPS private key file in PEM format. Required for HTTPS.|
|`--sslcert`||Absolute path to HTTPS certificate file in PEM format. Required for HTTPS.|
|`--ssldh`||Absolute path to HTTPS Diffie-Hellman parameters file. Optional for HTTPS.|

</details>

## Installing

`npx` downloads and runs the latest version on every invocation. This makes it convenient to occasionally run the server without having to worry about installing or updating, but might not be efficient when run often on a single machine.

It's possible to install this npm package globally:

```bash
npm i -g @wzlin/cabinet
```

Once installed, the server can be started without invoking `npx`:

```bash
cabinet
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
