# V821B: what the shared initramfs init (common/initramfs/init) does on this board.
BOARD_NAME=V821B
RESCUE_USB_DELAY=15

board_rescue() { :; }

board_help() {
    cat <<'EOT'

no rootfs taken over. Shell on the console (hvc0, the SBI console), 10.10.10.1 (telnet :23, :2323)
over USB-NCM after 15 s. Tools:
  net-up [ncm|acm]  USB gadget, one function at a time, started 15 s after boot, net-down first to switch
  nousb             skip that automatic net-up (within the 15 s)
  nc -l -p 9000 > /tmp/f   receive a file over the network
  devmem ADDR       read a register
  dmesg, /proc/mtd, /sys/kernel/debug
EOT
}
