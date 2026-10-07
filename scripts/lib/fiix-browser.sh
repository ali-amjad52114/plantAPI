#!/usr/bin/env bash
# Runs ON the Agent37 instance (uploaded to ~/plantapi/fiix-browser.sh). Uses agent-browser.
# Creds come from ~/plantapi/fiix.env (FIIX_URL, FIIX_USERNAME_B64, FIIX_PASSWORD_B64); never echoed.
# usage: fiix-browser.sh login | history | create "<summary>" | shot <path>
set -euo pipefail
set -a; . ~/plantapi/fiix.env; set +a
AB=agent-browser
# tag the input nearest below a visible label with data-pa=<key>
tag() { $AB eval "(()=>{const L=[...document.querySelectorAll('*')].filter(e=>e.children.length==0&&e.offsetParent&&(e.innerText||'').trim()==='$1');for(const l of L){const r=l.getBoundingClientRect();let best=null,bd=1e9;for(const i of document.querySelectorAll('input:not([type=hidden]),textarea')){if(!i.offsetParent)continue;const q=i.getBoundingClientRect();const d=(q.top-r.top)+Math.abs(q.left-r.left);if(q.top>=r.top&&q.top-r.top<60&&Math.abs(q.left-r.left)<40&&d<bd){bd=d;best=i}}if(best){best.setAttribute('data-pa','$2');return true}}return false})()" ; }
# JS-click the last visible element whose own text is exactly $1 (avoids overlay hit-test issues)
jsclick() { $AB eval "(()=>{const L=[...document.querySelectorAll('*')].filter(e=>e.offsetParent&&[...e.childNodes].some(n=>n.nodeType===3&&n.textContent.trim()==='$1'));const e=L[L.length-1];if(!e)return false;e.click();return true})()" | grep -q true; }
case "${1:-}" in
  login)
    $AB open "$FIIX_URL" >/dev/null; sleep 3
    if $AB get url | grep -q auth.fiix.software; then
      $AB fill 'input[type=email],input[name=email],input[name=username]' "$(echo "$FIIX_USERNAME_B64" | base64 -d)" >/dev/null
      $AB fill 'input[type=password]' "$(echo "$FIIX_PASSWORD_B64" | base64 -d)" >/dev/null
      $AB find role button click --name "Log In" >/dev/null 2>&1 || $AB press Enter >/dev/null
      sleep 8
    fi
    $AB get url ;;
  history)
    jsclick Maintenance; sleep 3
    $AB fill 'input[name$=_search____searchtermparameter]' "CV-104" >/dev/null; $AB press Enter >/dev/null; sleep 3
    $AB get text body | tr -s ' \t\n' ' ' | grep -o 'Time Spent Hours.*' | head -c 2000; echo ;;
  create)
    jsclick Maintenance; sleep 3
    jsclick New; sleep 4
    jsclick close || true
    tag Asset asset >/dev/null; $AB click '[data-pa=asset]' >/dev/null; $AB keyboard type "CV-104" >/dev/null; sleep 3
    jsclick "CV-104 Conveyor"; sleep 3
    tag "Summary of Issue" summary >/dev/null; $AB fill '[data-pa=summary]' "$2" >/dev/null
    jsclick Save; sleep 5
    $AB get text body | tr -s ' \t\n' ' ' | grep -o 'Work Order Administration: WO [0-9A-Za-z-]*' | head -1 ;;
  shot) $AB screenshot "$2" >/dev/null; ls -la "$2" ;;
  *) echo "usage: login|history|create <summary>|shot <path>"; exit 2 ;;
esac
