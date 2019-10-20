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

**1\. Create a folder for storing user profiles and a new user in that profile.**

Passwords are hashed using `bcrypt`; one way to generate the hash for a password is using `npx bcrypt-cli "PLAINTEXT_PASSWORD" 10`.

```bash
mkdir /path/to/profiles
cd /path/to/profiles
cat << 'EOD' > USERNAME.json
{
 "username": USERNAME,
 "password": BCRYPT_PASSWORD_HASH,
 "favouriteVideos": []
}
EOD
``` 

**2\. Run the server.**

```bash
npx @wzlin/cabinet \
  --library /path/to/library/folder
  --users /path/to/folder/containing/users
  --port PORT_TO_LISTEN_ON
```

## Options

|Name|Default|Description|
|---|---|---|
|`--library`|**Required**|Absolute path to the folder containing photos and videos (including in subdirectories).|
|`--users`|**Required**|Absolute path to the folder containing user profiles.|
|`--port`|Random port between 1024 and 9999 (inclusive).|Port to listen on.|
|`--video`|`mp4`|Comma-separated file extensions to consider as video files.|
|`--photo`|`png,gif,jpg,jpeg,bmp,svg,tif,tiff,webp`|Comma-separated file extensions to consider as photo files.|
|`--key`||Absolute path to HTTPS private key file in PEM format. Required for HTTPS.|
|`--cert`||Absolute path to HTTPS certificate file in PEM format. Required for HTTPS.|
|`--dh`||Absolute path to HTTPS Diffie-Hellman parameters file. Not required for HTTPS.|
