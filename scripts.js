document.addEventListener("DOMContentLoaded", () => {
  // Generate or retrieve unique visitor ID
  let visitorId = localStorage.getItem('chips_visitor_id');
  if (!visitorId) {
    visitorId = crypto.randomUUID();
    localStorage.setItem('chips_visitor_id', visitorId);
  }

  initLazyLoad();
  initOverlay();
  initDarkMode();
  initDownloadHandlers(visitorId);
  initContextMenuLogging(visitorId);
  initOverlayContextLogging(visitorId);
  initConsentBanner();
  initStarTrails();

  // Fetch and display download counts on page load
  fetchAndDisplayCounts();

  // Register service worker safely
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/service-worker.js')
        .then(registration => {
          console.log('Service Worker registered:', registration.scope);
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
    if (i < 6) {
      img.src = original;
    } else {
      img.src = "gifs/placeholder.jpg";
      io.observe(img);
    }
  });
}

// 2) Full-screen overlay
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

// Track right-click saves on overlay image
function initOverlayContextLogging(visitorId) {
  const overlayImg = document.getElementById("overlay-img");
  if (!overlayImg) return;
  overlayImg.addEventListener("contextmenu", () => {
    const gifUrl = overlayImg.src;
    const gifName = gifUrl.split("/").pop();
    const data = JSON.stringify({ gif_name: gifName, visitor_id: visitorId, action: 'right-click-save' });
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

// 4) Download button handler
function initDownloadHandlers(visitorId) {
  document.querySelectorAll(".download-btn").forEach(btn => {
    btn.addEventListener("click", async () => {
      const originalText = btn.textContent;
      btn.textContent = "Downloading…";
      btn.disabled = true;

      const gifItem = btn.closest(".gif-item");
      const img = gifItem.querySelector("img");
      const countEl = gifItem.querySelector(".download-count");
      const gifName = img.dataset.gif.split("/").pop();

      try {
        // Increment download count backend call
        const countData = JSON.stringify({ gif_name: gifName });
        if (navigator.sendBeacon) {
          navigator.sendBeacon("/.netlify/functions/update-download-count", countData);
        } else {
          await fetch("/.netlify/functions/update-download-count", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: countData,
          });
        }

        // Log visitor and download event
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
          await fetch("/.netlify/functions/logVisitor", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: visitorData,
          });
        }

        // Fetch GIF from backend and trigger real download
        const res = await fetch(`/.netlify/functions/deliver_gif?gif_name=${encodeURIComponent(gifName)}`);
        if (!res.ok) throw new Error(res.statusText);
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = gifName;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);

        // Refresh on-page download count
        const countRes = await fetch(`/.netlify/functions/get-download-count?gif_name=${encodeURIComponent(gifName)}`);
        const countData = await countRes.json();
        countEl.textContent = `Downloads: ${countData.count}`;
      } catch (err) {
        console.error("Download error:", err);
      } finally {
        btn.textContent = originalText;
        btn.disabled = false;
      }
    });
  });
}

// 5) Context menu and middle click logging on thumbnails
function initContextMenuLogging(visitorId) {
  document.querySelectorAll(".gif-item img").forEach(img => {
    const logBoth = () => {
      const gifName = (img.dataset.gif || "").split("/").pop();
      const countData = JSON.stringify({ gif_name: gifName });

      // Update count
      if (navigator.sendBeacon) {
        navigator.sendBeacon("/.netlify/functions/update-download-count", countData);
      } else {
        fetch("/.netlify/functions/update-download-count", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: countData,
        }).catch(console.error);
      }

      // Log visitor
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
          body: visitorData,
        }).catch(console.error);
      }
    };
    img.addEventListener("contextmenu", logBoth);
    img.addEventListener("auxclick", e => {
      if (e.button === 1) logBoth();
    });
  });
}

// 6) Cookie Consent Banner
function initConsentBanner() {
  if (document.getElementById("consent-banner")) return;
  if (localStorage.getItem("cookiesAccepted") === "true") {
    document.querySelectorAll(".download-btn").forEach(btn => btn.disabled = false);
    return;
  }
  document.querySelectorAll(".download-btn").forEach(btn => btn.disabled = true);
  const banner = document.createElement("div");
  banner.id = "consent-banner";
  banner.innerHTML = `
    <p>We use cookies to ensure you get the best experience.</p>
    <button>Accept</button>
  `;
  document.body.appendChild(banner);
  banner.querySelector("button").addEventListener("click", () => {
    localStorage.setItem("cookiesAccepted", "true");
    banner.style.display = "none";
    document.querySelectorAll(".download-btn").forEach(btn => btn.disabled = false);
  });
}

// 7) Star trails effect on mouse move
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

// Fetch and display counts for all GIFs on page load
async function fetchAndDisplayCounts() {
  const gifItems = document.querySelectorAll(".gif-item");
  for (const item of gifItems) {
    const img = item.querySelector("img");
    if (img?.dataset.gif) {
      const gifName = img.dataset.gif.split("/").pop();
      try {
        const res = await fetch(`/.netlify/functions/get-download-count?gif_name=${encodeURIComponent(gifName)}`);
        if (res.ok) {
          const data = await res.json();
          const countEl = item.querySelector(".download-count");
          if (countEl) {
            countEl.textContent = `Downloads: ${data.count}`;
          }
        } else {
          console.error(`Failed to fetch count for ${gifName}:`, res.statusText);
        }
      } catch (err) {
        console.error(`Error fetching count for ${gifName}:`, err);
      }
    }
  }
}

// --- Additional code to stretch bottom navigation bar full width ---

function ensurePaginationFullWidth() {
  const bars = document.querySelectorAll('.pagination, .pagination-top');
  bars.forEach(bar => {
    bar.style.width = '100%';
    bar.style.maxWidth = '100%';
    bar.style.marginLeft = '0';
    bar.style.marginRight = '0';
    bar.style.borderRadius = '0';
  });
}

document.addEventListener('DOMContentLoaded', () => {
  ensurePaginationFullWidth();
});
