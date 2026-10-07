#!/usr/bin/env bash
# Runs ON the Agent37 instance (uploaded to ~/plantapi/fiix-browser.sh). Uses agent-browser.
# Creds come from ~/plantapi/fiix.env (FIIX_URL, FIIX_USERNAME_B64, FIIX_PASSWORD_B64); never echoed.
# usage: fiix-browser.sh login | history | create "<summary>" | users <wo> | assign <wo> "<user full name>" | close <wo> | status [wo] | shot <path>
set -euo pipefail
set -a; . ~/plantapi/fiix.env; set +a
AB=agent-browser
# tag the input nearest below a visible label with data-pa=<key>
tag() { $AB eval "(()=>{const L=[...document.querySelectorAll('*')].filter(e=>e.children.length==0&&e.offsetParent&&(e.innerText||'').trim()==='$1');for(const l of L){const r=l.getBoundingClientRect();let best=null,bd=1e9;for(const i of document.querySelectorAll('input:not([type=hidden]),textarea')){if(!i.offsetParent)continue;const q=i.getBoundingClientRect();const d=(q.top-r.top)+Math.abs(q.left-r.left);if(q.top>=r.top&&q.top-r.top<60&&Math.abs(q.left-r.left)<40&&d<bd){bd=d;best=i}}if(best){best.setAttribute('data-pa','$2');return true}}return false})()" ; }
# JS-click the last visible element whose own text is exactly $1 (avoids overlay hit-test issues)
jsclick() { $AB eval "(()=>{const L=[...document.querySelectorAll('*')].filter(e=>e.offsetParent&&[...e.childNodes].some(n=>n.nodeType===3&&n.textContent.trim()==='$1'));const e=L[L.length-1];if(!e)return false;e.click();return true})()" | grep -q true; }
# click the lookup arrow just right of the tagged input (opens the Fiix picker dialog)
arrow() { $AB eval "(()=>{const i=document.querySelector('[data-pa=$1]');const r=i.getBoundingClientRect();const e=document.elementFromPoint(r.right+12,r.top+r.height/2);if(!e)return false;['mousedown','mouseup','click'].forEach(t=>e.dispatchEvent(new MouseEvent(t,{bubbles:true})));return true})()" | grep -q true; }
val() { $AB eval "document.querySelectorAll('[data-pa=v]').forEach(e=>e.removeAttribute('data-pa'))" >/dev/null; tag "$1" v >/dev/null; $AB eval "document.querySelector('[data-pa=v]')?.value" | tr -d '"'; }
# open a WO from the list (any status) by code
openwo() { jsclick Maintenance; sleep 3; $AB fill 'input[name$=_search____searchtermparameter]' "$1" >/dev/null; $AB press Enter >/dev/null; sleep 3
  $AB eval "(()=>{const r=[...document.querySelectorAll('tr')].find(r=>r.offsetParent&&r.cells[1]&&r.cells[1].innerText.trim()==='$1');if(!r)return false;r.cells[2].click();return true})()" | grep -q true || { echo "WO $1 not in Active list"; return 1; }; sleep 4; }
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
  history) # all CV-104 WOs (any status): code | description | ... | status | ...
    jsclick Maintenance; sleep 3
    $AB eval "(()=>{const e=[...document.querySelectorAll('*')].find(e=>e.offsetParent&&e.children.length==0&&/^Status group:/.test((e.innerText||'').trim()));if(!e)return false;const r=e.getBoundingClientRect();const a=document.elementFromPoint(r.right+300>innerWidth?r.right:r.left+330,r.top+r.height/2)||e;[a,e].forEach(x=>['mousedown','mouseup','click'].forEach(t=>x.dispatchEvent(new MouseEvent(t,{bubbles:true}))));return true})()" >/dev/null; sleep 2
    jsclick "All work orders" || true; sleep 3
    $AB fill 'input[name$=_search____searchtermparameter]' "CV-104" >/dev/null; $AB press Enter >/dev/null; sleep 3
    $AB eval "[...document.querySelectorAll('tr')].filter(r=>r.offsetParent&&/CV-104 Conveyor/.test(r.innerText)).map(r=>[...r.cells].map(c=>c.innerText.trim()).filter(Boolean).join(' | ')).join('\n')" ;;
  create)
    jsclick Maintenance; sleep 3
    jsclick New; sleep 4
    jsclick close || true
    tag Asset asset >/dev/null; $AB click '[data-pa=asset]' >/dev/null; $AB keyboard type "CV-104" >/dev/null; sleep 3
    jsclick "CV-104 Conveyor"; sleep 3
    tag "Summary of Issue" summary >/dev/null; $AB fill '[data-pa=summary]' "$2" >/dev/null
    jsclick Save; sleep 5
    $AB get text body | tr -s ' \t\n' ' ' | grep -o 'Work Order Administration: WO [0-9A-Za-z-]*' | head -1 ;;
  users)   # list Fiix users offered by "Assigned To User" for WO $2
    openwo "$2"; tag "Assigned To User" assignee >/dev/null; arrow assignee; sleep 3
    $AB eval "[...document.querySelectorAll('tr')].filter(r=>r.offsetParent&&r.cells.length>3).map(r=>r.cells[3].innerText.trim()).filter(Boolean).join('\n')" ;;
  assign)  # assign WO $2 to Fiix user full name $3
    openwo "$2"; tag "Assigned To User" assignee >/dev/null; arrow assignee; sleep 3
    jsclick "$3" || { echo "user '$3' not found"; exit 3; }; sleep 3; jsclick Save; sleep 5
    openwo "$2"; echo "assigned_to=$(val 'Assigned To User')" ;;
  close)   # set WO $2 status to "Closed, Completed", save, read back
    openwo "$2"; tag "Work Order Status" st >/dev/null; arrow st; sleep 3
    jsclick "Closed, Completed" || { echo "status option not found"; exit 3; }; sleep 3; jsclick Save; sleep 6
    echo "status=$(val 'Work Order Status')"; echo "assigned_to=$(val 'Assigned To User')"
    openwo "$2" >/dev/null 2>&1 && echo "still_active=yes" || echo "still_active=no" ;;
  status)  # read status of the WO page currently open (or WO $2 if still active)
    [ -n "${2:-}" ] && openwo "$2"; echo "status=$(val 'Work Order Status')"; echo "assigned_to=$(val 'Assigned To User')" ;;
  shot) $AB screenshot "$2" >/dev/null; ls -la "$2" ;;
  *) echo "usage: login|history|create <summary>|shot <path>"; exit 2 ;;
esac
