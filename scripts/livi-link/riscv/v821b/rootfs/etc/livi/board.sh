# V821B + AIC8800D80: what /init and /etc/init.d/rcS do on this board and not on the others.

# The sunxi twi controller registers a moment after boot, rcS retries until /dev/i2c-1 is there.
MFI_I2C=1

board_init() { mdev -s; }

# CRITICAL: OpenSBI M-mode watchdog
board_early() {
    insmod /etc/awbase.ko 2>&1 | tail -1
    [ -e /sys/class/awbase ] && echo '[livi] awbase watchdog fed' || echo '[livi] WARN awbase not registered'
}

# AIC8800 power (Stock ly,dev: wifi_en=PD11, wifi_en2=PD17 both HIGH), then the driver with its BT part.
board_wifi() {
    for g in 107 113; do
        [ -e /sys/class/gpio/gpio$g ] || echo $g > /sys/class/gpio/export 2>/dev/null
        echo out > /sys/class/gpio/gpio$g/direction 2>/dev/null
        echo 1   > /sys/class/gpio/gpio$g/value      2>/dev/null
    done
    echo '[livi] wifi power PD11+PD17 HIGH'
    sleep 0.2

    echo '[livi] insmod aic8800_bsp'
    insmod /lib/modules/5.4.220/aic8800_bsp.ko 2>&1 | tail -1
    sleep 1
    echo '[livi] insmod aic8800_fdrv + aic8800_btlpm'
    insmod /lib/modules/5.4.220/aic8800_fdrv.ko aicwf_dbg_level=1 2>&1 | tail -1
    insmod /lib/modules/5.4.220/aic8800_btlpm.ko 2>&1 | tail -1
    sleep 0.5
}
