#!/usr/bin/env bash
# Runs ON the Agent37 instance (uploaded to ~/plantapi/rs-browser.sh). READ ONLY: never log in, add to cart or check out.
# usage: rs-browser.sh rs-confirm <part> [shot_path]
# Prints key=value lines: status=OK|BLOCKED, url=, title=, price=, stock=, lead_time=, block_reason=, screenshot=
# Bot walls (CAPTCHA / Access Denied) are reported as BLOCKED and never bypassed.
set -uo pipefail
AB=agent-browser
part="${2:-LC1D09BD}"; shot="${3:-$HOME/shots/rs-$part-$(date +%s).png}"; mkdir -p "$(dirname "$shot")"
blocked() { $AB get text body 2>/dev/null | tr -s ' \t\n' ' ' | grep -o -i -m1 "captcha-delivery\|unusual traffic\|access denied\|verify you are human\|are you a robot" ; }
case "${1:-}" in
  rs-confirm)
    for u in "https://us.rs-online.com/search/?q=$part" "https://uk.rs-online.com/web/c/?searchTerm=$part"; do
      $AB open "$u" >/dev/null 2>&1 || { sleep 2; $AB open "$u" >/dev/null 2>&1; }; sleep 6
      reason=$(blocked)
      if [ -z "$reason" ]; then
        # first product link for the part, then read the product page
        p=$($AB eval "([...document.querySelectorAll('a[href]')].map(a=>a.href).find(h=>/\/(product|dp)\//i.test(h)&&new RegExp('$part','i').test(h))||'')" | tr -d '"')
        [ -n "$p" ] && { $AB open "$p" >/dev/null 2>&1; sleep 6; reason=$(blocked); }
      fi
      [ -z "$reason" ] && break
      echo "tried=$u blocked_by=$reason"
    done
    $AB screenshot "$shot" >/dev/null 2>&1
    echo "url=$($AB get url)"; echo "screenshot=$shot"
    if [ -n "$reason" ]; then echo "status=BLOCKED"; echo "block_reason=$reason"; exit 3; fi
    t=$($AB get text body | tr -s ' \t\n' ' ')
    echo "title=$($AB get title)"
    echo "price=$(echo "$t" | grep -o -m1 '\$ *[0-9][0-9,]*\.[0-9][0-9]' | head -1)"
    echo "stock=$(echo "$t" | grep -o -i -m1 '[0-9,]* *in stock\|out of stock\|no stock\|available to back.order' | head -1)"
    echo "lead_time=$(echo "$t" | grep -o -i -m1 '\(ships\|dispatch\|delivery\|lead time\)[^.]\{0,60\}' | head -1)"
    echo "status=OK" ;;
  *) echo "usage: rs-confirm <part> [shot_path]"; exit 2 ;;
esac
