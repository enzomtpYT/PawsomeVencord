# PawsomeVencord

## Note, this is an unofficial fork of equicord. This repo might be behind the main repo at times.

- Not to mention that this fork is pretty much only being maintained by 2 people LOL

![](https://img.shields.io/github/package-json/v/enzomtpYT/PawsomeVencord?style=for-the-badge&logo=github&logoColor=d3869b&label=&color=1d2021&labelColor=282828)

PawsomeVencord is a fork of [Equicord](https://github.com/equicord/equicord), with over 300+ plugins.

You can join our [discord server](https://discord.gg/w9jVtzNx4c) for commits, changes, chat or even support.

### Included Plugins

Our included plugins can be found [here](https://equicord.org/plugins)

## Installing / Uninstalling

Windows

- [GUI](https://github.com/enzomtpYT/PawsomeVencordInstaller/releases/latest/download/PawsomeVencordInstaller.exe)
- [CLI](https://github.com/enzomtpYT/PawsomeVencordInstaller/releases/latest/download/PawsomeVencordInstallerCli.exe)

MacOS

- [GUI](https://github.com/enzomtpYT/PawsomeVencordInstaller/releases/latest/download/PawsomeVencordInstaller.MacOS.zip)

Linux

- [GUI-X11](https://github.com/enzomtpYT/PawsomeVencordInstaller/releases/latest/download/PawsomeVencordInstaller-x11)
- [CLI](https://github.com/enzomtpYT/PawsomeVencordInstaller/releases/latest/download/PawsomeVencordInstallerCli-Linux)

```shell
sh -c "$(curl -sS https://raw.githubusercontent.com/enzomtpYT/PawsomeVencord/refs/heads/main/misc/install.sh)"
```

## Installing PawsomeVencord Devbuild

### Dependencies

[Git](https://git-scm.com/download) and [Node.JS LTS](https://nodejs.dev/en/) are required.

Install `pnpm`:

> :exclamation: This next command may need to be run as admin/root depending on your system, and you may need to close and reopen your terminal for pnpm to be in your PATH.

```shell
npm i -g pnpm
```

> :exclamation: **IMPORTANT** Make sure you aren't using an admin/root terminal from here onwards. It **will** mess up your Discord/PawsomeVencord instance and you **will** most likely have to reinstall.

Clone PawsomeVencord:

```shell
git clone https://github.com/enzomtpYT/PawsomeVencord
cd PawsomeVencord
```

Install dependencies:

```shell
pnpm install --frozen-lockfile
```

Build PawsomeVencord:

```shell
pnpm build
```

Inject PawsomeVencord into your client:

```shell
pnpm inject
```

## Credits

Thank you to [Equicord](https://github.com/equicord), [Vendicated](https://github.com/Vendicated) for creating [Vencord](https://github.com/Vendicated/Vencord) & [Suncord](https://github.com/verticalsync/Suncord) by [verticalsync](https://github.com/verticalsync) for helping when needed.

## Disclaimer

Discord is trademark of Discord Inc. and solely mentioned for the sake of descriptivity.
Mentioning it does not imply any affiliation with or endorsement by Discord Inc.
Vencord is not connected to PawsomeVencord and as such, all donation links go to Vendicated's donation link.

<details>
<summary>Using PawsomeVencord violates Discord's terms of service</summary>

Client modifications are against Discord’s Terms of Service.

However, Discord is pretty indifferent about them and there are no known cases of users getting banned for using client mods! So you should generally be fine if you don’t use plugins that implement abusive behaviour. But no worries, all inbuilt plugins are safe to use!

Regardless, if your account is essential to you and getting disabled would be a disaster for you, you should probably not use any client mods (not exclusive to PawsomeVencord), just to be safe

Additionally, make sure not to post screenshots with PawsomeVencord in a server where you might get banned for it

</details>
