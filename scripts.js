// scripts.js

document.addEventListener("DOMContentLoaded", () => {
  // Generate or get unique visitor ID from localStorage
  let visitorId = localStorage.getItem('chips_visitor_id');
  if (!visitorId) {
    visitorId = crypto.randomUUID();
    localStorage.setItem('chips_visitor_id', visitorId);
  }

  initLazyLoad();
  initOverlay();
  initDarkMode();
  initDownloadHandlers(visitorId);           // Pass visitorId
  initContextMenuLogging(visitorId);         // Pass visitorId
  initOverlayContextMenuLogging(visitorId); // Right-click save logging on overlay
  initConsentBanner();                        // Banner visible but no blocking, fixed to remember acceptance
  initStarTrails();

  fetchAndDisplayAllDownloadCounts();

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/service-worker.js')
        .then(registration => {
          console.log('Service Worker registered with scope:', registration.scope);
        })
        .catch(error => {
          console.warn('Service Worker registration failed:', error);
        });
    });
  }
});

// 1) Lazy-load GIFs below the fold
function initLazyLoad() {
  const io = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const img = entry.target;
        if (img.dataset.gif && img.src !== img.dataset.gif) {
          img.src = img.dataset.gif;
          io.unobserve(img);
        }
      }
    });
  }, { rootMargin: "800px" });

  document.querySelectorAll(".gif-item img").forEach((img, i) => {
    const original = img.src;
    img.dataset.gif = original;
    if (i < 6) { // Prime first few
      img.src = original;
    } else {
      img.src = "gifs/placeholder.jpg";
      io.observe(img);
    }
  });
}

// 2) Full-screen overlay on GIF click (not download button)
function initOverlay() {
  document.querySelectorAll(".gif-item").forEach(item => {
    item.addEventListener("click", e => {
      if (e.target.classList.contains("download-btn")) return;
      const img = item.querySelector("img");
      const overlay = document.getElementById("overlay");
      const overlayImg = document.getElementById("overlay-img");
      if (img?.dataset.gif && overlay && overlayImg) {
        overlayImg.src = img.dataset.gif;
        overlay.classList.add("active");
      }
    });
  });
  const overlay = document.getElementById("overlay");
  overlay?.addEventListener("click", () => {
    overlay.classList.remove("active");
    document.getElementById("overlay-img").src = "";
  });
}

// New: Right-click context menu logging on overlay image for "Save As" detection
function initOverlayContextMenuLogging(visitorId) {
  const overlayImg = document.getElementById("overlay-img");
  if (!overlayImg) return;
  overlayImg.addEventListener("contextmenu", () => {
    const gifUrl = overlayImg.src;
    const gifName = gifUrl.split("/").pop();
    const data = JSON.stringify({ gif_name: gifName, visitor_id: visitorId, action: 'right-click-save-overlay' });
    if (navigator.sendBeacon) {
      navigator.sendBeacon('/.netlify/functions/logVisitor', data);
    } else {
      fetch('/.netlify/functions/logVisitor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: data,
      }).catch(console.error);
    }
  });
}

// 3) Dark mode toggle
function initDarkMode() {
  const toggle = document.getElementById("toggleDarkMode");
  toggle?.addEventListener("click", () => {
    document.body.classList.toggle("dark-mode");
    localStorage.setItem("darkMode", document.body.classList.contains("dark-mode"));
  });
  if (localStorage.getItem("darkMode") === "true") {
    document.body.classList.add("dark-mode");
  }
}

// 4) Button-click handler: update counts, log visitor, download GIF
function initDownloadHandlers(visitorId) {
  document.querySelectorAll(".download-btn").forEach(btn => {
    btn.addEventListener("click", async () => {
      const originalText = btn.textContent;
      btn.textContent = "Downloading…";
      btn.disabled = true;

      try {
        const gifItem = btn.closest(".gif-item");
        const img = gifItem.querySelector("img");
        const countEl = gifItem.querySelector(".download-count");

        // Safely extract gif name and trim whitespace
        const rawGifName = decodeURIComponent(img.dataset.gif.split("/").pop()).trim();
        const gifNameEncoded = encodeURIComponent(rawGifName);

        // A) Increment download count using POST JSON
        const countData = JSON.stringify({ gif_name: rawGifName });
        if (navigator.sendBeacon) {
          navigator.sendBeacon("/.netlify/functions/update-download-count", countData);
        } else {
          await fetch("/.netlify/functions/update-download-count", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: countData
          });
        }

        // B) Log visitor & download event
        const visitorData = JSON.stringify({
          visitor_id: visitorId,
          userAgent: navigator.userAgent,
          page: window.location.pathname,
          referrer: document.referrer,
          gif_name: rawGifName
        });
        if (navigator.sendBeacon) {
          navigator.sendBeacon("/.netlify/functions/logVisitor", visitorData);
        } else {
          await fetch("/.netlify/functions/logVisitor", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: visitorData
          });
        }

        // C) Fetch GIF from deliver_gif endpoint and trigger download
        const res = await fetch(`/.netlify/functions/deliver_gif?gif_name=${gifNameEncoded}`);
        if (!res.ok) throw new Error(res.statusText);
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);

        const a = document.createElement("a");
        a.href = url;
        a.download = rawGifName;
        document.body.appendChild(a);
        a.click();
        a.remove();

        // Cleanup blob URL after a delay
        setTimeout(() => URL.revokeObjectURL(url), 10000);

        // D) Refresh download count on page without beacon (GET request)
        try {
          const countRes = await fetch(`/.netlify/functions/get-download-count?gif_name=${gifNameEncoded}`);
          if (countRes.ok) {
            const countDataRes = await countRes.json();
            const safeCount = countDataRes.count ?? 0;
            if (countEl) {
              countEl.textContent = `Downloads: ${safeCount}`;
            }
          } else {
            console.error(`Failed to refresh download count:`, countRes.statusText);
          }
        } catch (refreshErr) {
          console.error("Error refreshing download count:", refreshErr);
        }

      } catch (err) {
        console.error("Download error:", err);
      } finally {
        btn.textContent = originalText;
        btn.disabled = false;
      }
    });
  });
}

// 5) Right-click & middle-click logging on GIFs
function initContextMenuLogging(visitorId) {
  document.querySelectorAll(".gif-item img").forEach(img => {
    const logBoth = () => {
      const gifNameRaw = (img.dataset.gif || "").split("/").pop();
      const gifName = decodeURIComponent(gifNameRaw).trim();

      const countData = JSON.stringify({ gif_name: gifName });

      if (navigator.sendBeacon) {
        navigator.sendBeacon("/.netlify/functions/update-download-count", countData);
      } else {
        fetch("/.netlify/functions/update-download-count", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: countData
        }).catch(console.error);
      }

      const visitorData = JSON.stringify({
        visitor_id: visitorId,
        userAgent: navigator.userAgent,
        page: window.location.pathname,
        referrer: document.referrer,
        gif_name: gifName
      });

      if (navigator.sendBeacon) {
        navigator.sendBeacon("/.netlify/functions/logVisitor", visitorData);
      } else {
        fetch("/.netlify/functions/logVisitor", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: visitorData
        }).catch(console.error);
      }
    };
    img.addEventListener("contextmenu", logBoth);
    img.addEventListener("auxclick", e => {
      if (e.button === 1) logBoth();
    });
  });
}

// 6) Consent banner - visible but does not disable buttons
// *** FIXED: Checks localStorage to avoid showing again ***
function initConsentBanner() {
  // Check if cookies have already been accepted
  if (localStorage.getItem("cookiesAccepted") === "true") {
    return; // Do not show banner if accepted
  }

  if (document.getElementById("consent-banner")) return;

  const banner = document.createElement("div");
  banner.id = "consent-banner";
  banner.innerHTML = `
    <p>We use cookies to ensure you get the best experience.</p>
    <button>Accept Cookies</button>
  `;
  document.body.appendChild(banner);

  banner.querySelector("button").addEventListener("click", () => {
    localStorage.setItem("cookiesAccepted", "true");
    banner.style.display = "none";
  });
}

// 7) Star-trail mouse effect
function initStarTrails() {
  const container = document.createElement("div");
  container.style.position = "fixed";
  container.style.pointerEvents = "none";
  container.style.zIndex = "9999";
  document.body.appendChild(container);

  const stars = [];
  const total = 5;
  let index = 0;
  for (let i = 0; i < total; i++) {
    const star = document.createElement("div");
    star.textContent = "★";
    star.className = "star";
    container.appendChild(star);
    stars.push(star);
  }
  document.addEventListener("mousemove", e => {
    const star = stars[index];
    star.style.left = `${e.clientX}px`;
    star.style.top = `${e.clientY}px`;
    star.style.opacity = "1";
    setTimeout(() => {
      star.style.opacity = "0";
    }, 500);
    index = (index + 1) % total;
  });
}

// Fetch and update download counts on page load
async function fetchAndDisplayAllDownloadCounts() {
  const gifItems = document.querySelectorAll(".gif-item");
  for (const item of gifItems) {
    const img = item.querySelector("img");
    if (img?.dataset.gif) {
      const rawGifName = decodeURIComponent(img.dataset.gif.split("/").pop()).trim();
      const gifNameEncoded = encodeURIComponent(rawGifName);
      try {
        const res = await fetch(`/.netlify/functions/get-download-count?gif_name=${gifNameEncoded}`);
        if (res.ok) {
          const data = await res.json();
          const countEl = item.querySelector(".download-count");
          if (countEl) {
            const safeCount = data.count ?? 0;
            countEl.textContent = `Downloads: ${safeCount}`;
          }
        } else {
          console.error(`Failed to fetch count for ${rawGifName}:`, res.statusText);
        }
      } catch (err) {
        console.error(`Error fetching download count for ${rawGifName}:`, err);
      }
    }
  }
}