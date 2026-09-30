# LIVI Link

A CarPlay dongle, reflashed into a network accessory for LIVI's native CarPlay stack. It is
supported on Linux and macOS, and can provide:

- **MFi authentication** over the network
- **A Wi-Fi access point**
- **Bluetooth** as a vhci on Linux and on macOS the dongle pairs the phone

Each one is enabled separately in the settings. While the dongle is not selected in the settings,
LIVI turns its access point temporarily off to keep interference low.

## Firmware

Each firmware brings its own Linux kernel. The web interface shows it under **Kernel**.

| Firmware | Kernel |
| --- | --- |
| `imx6ul_iw416` | 7.2.8 |
| `imx6ul_rtl8822cs` | 7.2.8 |
| `imx6ul_rtl8822bs` | 7.2.8 |
| `v821b_aic8800d80` | 7.2.8  |
| `ax520_aic8800d80` | 7.2.8  |

## Supported hardware

Several bridges are the same board sold under different names, and one name can cover completely
different hardware. Vendors are known for keeping a product name while the board inside changes,
sometimes from one month to the next. The Mini Ultra3 alone has come with at least three different
boards so far, among them one with an Ingenic SoC and one with the Allwinner V821B. So the name on the box says little about what is inside. A
row counts as **confirmed** only once someone has successfully installed LIVI Link on that product.

| Firmware | Hardware | Sold as | Wi-Fi | Max PHY rate | State |
| --- | --- | --- | --- | --- | --- |
| `imx6ul_iw416`[^vendorfw] | NXP i.MX6UL, IW416 | CPC200-CCPA | Wi-Fi 4, 1x1, 5 GHz, 40 MHz | 150 Mbit/s | confirmed |
| `imx6ul_rtl8822cs` | NXP i.MX6UL, RTL8822CS | CPC200-CCPA | Wi-Fi 5, 2x2, 5 GHz, 80 MHz | 867 Mbit/s | not confirmed |
| `imx6ul_rtl8822bs`[^nobt] | NXP i.MX6UL, RTL8822BS | CPC200-Autokit | Wi-Fi 5, 2x2, 5 GHz, 80 MHz | 867 Mbit/s | confirmed |
| `imx6ul_iw416` | NXP i.MX6UL, IW416 | CPC200-C2Air | Wi-Fi 4, 1x1, 5 GHz, 40 MHz | 150 Mbit/s | not confirmed |
| `imx6ul_iw416` | NXP i.MX6UL, IW416 | CPC200-2Air | Wi-Fi 4, 1x1, 5 GHz, 40 MHz | 150 Mbit/s | not confirmed |
| `v821b_aic8800d80` | Allwinner V821B, AIC8800D80 | Mini Ultra3 | Wi-Fi 6, 1x1, 5 GHz, 80 MHz | 600 Mbit/s | confirmed |
| none | Ingenic X1600E, AIC8800D80 | Mini Ultra1 | Wi-Fi 6, 1x1, 5 GHz, 80 MHz | 600 Mbit/s | not supported |
| `v821b_aic8800d80` | Allwinner V821B, AIC8800D80 | CPC200-C2Air | Wi-Fi 6, 1x1, 5 GHz, 80 MHz | 600 Mbit/s | not confirmed |
| `ax520_aic8800d80` | Axera AX520CE, AIC8800D80 | CPC200-C2Air | Wi-Fi 6, 1x1, 5 GHz, 80 MHz | 600 Mbit/s | confirmed[^mfi] |

[^vendorfw]: Tested from the latest vendor firmware. If the install stops with an error, update the
    dongle to the latest vendor firmware first and try again.
[^mfi]: MFi authentication needs an MFi chip on the dongle. Without one, LIVI Link provides the
    access point and Bluetooth only.
[^nobt]: Wi-Fi only for now, the module's Bluetooth is not supported yet. On macOS, where the
    dongle pairs the phone, that means no wireless CarPlay.

That is why the provisioning tool probes the dongle before it writes anything, and reports hardware
it does not know as not found.

## Setup

Flashing a dongle is at your own risk. If it goes wrong, open an [issue](https://github.com/f-io/LIVI/issues). Most dongles can be recovered even after a failed flash.

Download `livi-link-provision` for your platform from the release page, then with the dongle
plugged in (with some dongles you also need to be on their Wi-Fi):

```bash
chmod +x livi-link-provision
./livi-link-provision
```

macOS quarantines downloads, so run this first:

```bash
xattr -d com.apple.quarantine livi-link-provision
```

If the dongle is still on stock firmware, the tool asks you to unplug and replug it once. After
that it runs on its own: it backs up the flash, installs LIVI Link and waits until the dongle
answers as LIVI Link. A CPC200-CCPA restarts a few times on the way, because its kernel goes in
first. The backup is taken before anything is written and goes to
`~/Library/Application Support/LIVI/backup/dongle-backup/` on macOS, or
`~/.local/share/LIVI/dongle-backup/` on Linux.

Some i.MX6UL dongles offer no network over USB on their vendor firmware. The tool notices that
after the replug and asks you to join the dongle's own Wi-Fi instead, with the name and password
the dongle normally uses.

A CPC200-CCPA that got LIVI Link from an earlier release runs it on top of the vendor firmware.
Its web interface cannot flash the current firmware, please use provisioning tool.

## Web interface

<http://livi-link.local/>, or <http://10.10.10.1/> over USB. It shows which firmware the dongle
runs, the MFi chip it found, what the radio is actually doing (channel, width, clients, link
rate), Bluetooth, and, if the LED supports colours, its colour and brightness.

<p align="center">
  <img src="docs/media/livi-link/LL.png" width="600" alt="LIVI Link web interface" />
</p>

## Updating

Under **Firmware**, **Check** looks for a newer version and **Update** installs it. With
**Nightly** on it checks the nightly builds instead of the latest release. The device you have the
web interface open on needs internet access. Do not unplug the dongle while it writes. On a dongle
whose LED shows the states below, red and blue alternate until it is done. A CPC200-CCPA restarts
twice when an update brings a new kernel.

Every release has the firmware files attached, so you can also upload one by hand. The
provisioning tool updates a dongle the same way.

## LED

If the dongle has an LED, Wi-Fi uses the status LED[^led] and Bluetooth is blue.

| State | LED |
| --- | --- |
| Waiting for a Wi-Fi client | status LED blinks |
| Wi-Fi client connected | status LED on |
| Bluetooth paging | blue blinks |
| Bluetooth connected | blue on |
| Writing firmware | red and blue alternate |

[^led]: Red, or cyan if the LED supports colours. You can change colour and brightness on the
    web interface.

## Getting back to stock

With the `v821b_aic8800d80` or `ax520_aic8800d80` firmware, upload the backup the install made
(`v821b_stock_<date>.lfwb` or `ax520_stock_<date>.lfwb` in the backup folder) on the web interface
under **Firmware**. The dongle writes it and reboots into its original firmware. Do not unplug it
while it writes.

With an `imx6ul_…` firmware, run the provisioning tool on the computer
that did the install and pick **back to the vendor firmware**. It takes the backup it made of this
dongle, checks that the backup really belongs to it, writes it back from the rescue system and
restarts into the original firmware. Do not unplug the dongle while it writes.

## If something goes wrong

If the dongle does not come up on USB or Wi-Fi, give it 30 seconds, then replug it. The logs are under `/tmp` on the dongle.

A CPC200-CCPA whose system does not come up stays in a rescue system after the next restart. It is
reachable over USB at `10.10.10.1`, and the provisioning tool installs LIVI Link again from there.
