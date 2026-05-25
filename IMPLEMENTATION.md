# Sathya Sai Prema Kuterram — Implementation Plan

## Issues

1. **Wrong logo image across all pages** — all 5 pages use `mpkmhgxa-image.png`. Should use `mpknjot3-image.png` (the 3rd image = correct logo per user instruction).

2. **Events page — logo oversized** — nav logo appears too large / distorted. Need to override nav-logo-img dimensions specifically or use a proper cropped aspect ratio.

3. **Dashboard — flow tree remnants** — flow tree was moved to home page. Verify dashboard has zero flow tree. Ensure only stats + Razorpay remain.

4. **Flow tree animation on home page** — branch opening animation needs improvement. SVG paths should draw smoothly from root outward with `stroke-dashoffset` animation, proper joint dot glow, and elastic child node entrance.

---

## Checklist

### P0 — Must Fix

- [ ] Logo file replaced to `mpknjot3-image.png` in **index.html** nav
- [ ] Logo file replaced to `mpknjot3-image.png` in **about.html** nav
- [ ] Logo file replaced to `mpknjot3-image.png` in **gallery.html** nav
- [ ] Logo file replaced to `mpknjot3-image.png` in **events.html** nav
- [ ] Logo file replaced to `mpknjot3-image.png` in **dashboard.html** nav
- [ ] Events page — `nav-logo-img` fixed: force exact `width:36px; height:36px; object-fit:cover;` (inline if theme.css override not working)
- [ ] Dashboard — confirm zero flow tree HTML/SVG/JS present
- [ ] Dashboard — confirm no "Prema Kuteeram" branch text (only Trust name in footer + Razorpay, which is correct)
- [ ] Home page — flow tree root click opens branches with smooth SVG draw animation
- [ ] Home page — flow tree click again collapses branches

### P1 — Should Fix

- [ ] Nav logo shows crisp at all screen sizes (responsive: check 360px, 768px, 1024px)
- [ ] Flow tree child nodes have staggered entrance delay
- [ ] Flow tree branch paths animate with `stroke-dashoffset` (not just opacity fade)
- [ ] Joint dots glow at branch connection points
- [ ] Collapse animation is instant/reversed (not lingering)

### P2 — Nice to Have

- [ ] Logo image preloaded to avoid flash on page load
- [ ] Flow tree nodes have hover glow effect
- [ ] Mobile flow tree stacks vertically with shorter connector lines

---

## Execution Steps

| Step | File(s) | Action |
|------|---------|--------|
| 1 | `index.html`, `about.html`, `gallery.html`, `events.html`, `dashboard.html` | Replace all `src="mpkmhgxa-image.png"` → `src="mpknjot3-image.png"` |
| 2 | `events.html` | Add inline style `width:36px;height:36px;object-fit:cover;` to nav logo img |
| 3 | `dashboard.html` | Scan for flow tree fragments — remove any remaining |
| 4 | `index.html` | Polish SVG branch paths: increase stroke-dasharray, add smoother easing, ensure glow layer |
| 5 | All | Reload server, verify in browser at 360px / 768px / 1024px |

---

## Verification

After changes:
- Open `index.html` — nav shows correct logo, click root → branches draw smoothly
- Open `about.html` — logo correct
- Open `gallery.html` — logo correct
- Open `events.html` — logo correct, not oversized
- Open `dashboard.html` — no flow tree, only stats + donation + Razorpay
