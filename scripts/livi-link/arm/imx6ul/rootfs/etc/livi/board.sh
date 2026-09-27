# i.MX6ULL + IW416: what /init and /etc/init.d/rcS do on this board and not on the others.

# The MFi chip answers at 0x11 on the bus of the UART5 pads.
MFI_I2C=1

# /dev arrives already populated (devtmpfs, moved over by the initramfs).
board_init() { :; }

board_early() { :; }

# mwifiex is built into the kernel and powers the IW416 itself. With driver_mode=2 it registers the
# access point interface as uap0, the name the shared scripts and hostapd.conf expect is wlan0.
board_wifi() {
    for i in $(seq 1 20); do
        [ -e /sys/class/net/uap0 ] && break
        sleep 0.5
    done
    ip link set uap0 name wlan0 && echo '[livi] uap0 is wlan0'
    # The combo firmware mwifiex loaded runs the Bluetooth half too, btnxpuart only attaches to it.
    M=/lib/modules/$(uname -r)
    for m in $(cat $M/load); do
        insmod $M/$m.ko && echo "[livi] insmod $m"
    done
}
