/* scripts.js v20260129 — ACTIVE SERVICE WORKER (RECONFIGURED) */

/* Prevent FOUC: Make body visible once DOM is fully loaded */
document.addEventListener("DOMContentLoaded", () => {
  document.body.style.visibility = "visible";

  // Generate or get unique visitor ID from localStorage
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
  initOverlayContextMenuLogging(visitorId);
  initStarTrails();

  fetchAndDisplayAllDownloadCounts();
});

/* 1) Lazy-load GIFs below the fold */
function initLazyLoad() {
  const io = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const img = entry.target;
        const filename = img.dataset.gif;
        if (filename) {
          img.src = "/static/gifs/" + filename;
          io.unobserve(img);
        }
      }
    });
  }, { rootMargin: "800px" });

  document.querySelectorAll(".gif-item img").forEach((img, i) => {
    const filename = img.dataset.gif;

    if (i < 6) {
      img.src = "/static/gifs/" + filename;
    } else {
      img.src = "gifs/placeholder.jpg";
      io.observe(img);
    }
  });
}

/* 2) Full-screen overlay on GIF click */
function initOverlay() {
  document.querySelectorAll(".gif-item").forEach(item => {
    item.addEventListener("click", e => {
      if (e.target.classList.contains("download-btn")) return;
      const img = item.querySelector("img");
      const overlay = document.getElementById("overlay");
      const overlayImg = document.getElementById("overlay-img");
      if (img?.dataset.gif && overlay && overlayImg) {
        overlayImg.src = "/static/gifs/" + img.dataset.gif;
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

/* Overlay right-click logging */
function initOverlayContextMenuLogging(visitorId) {
  const overlayImg = document.getElementById("overlay-img");
  if (!overlayImg) return;

  overlayImg.addEventListener("contextmenu", () => {
    const gifUrl = overlayImg.src;
    const gifName = gifUrl.split("/").pop();
    const data = JSON.stringify({
      gif_name: gifName,
      visitor_id: visitorId,
      action: 'right-click-save-overlay'
    });

    if (navigator.sendBeacon) {
      navigator.sendBeacon('/api/log', data);
    } else {
      fetch('/api/log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: data,
      }).catch(console.error);
    }
  });
}

/* 3) Dark mode toggle */
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

/* 4) Download handler */
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

        const rawGifName = decodeURIComponent(img.dataset.gif.split("gif_name=").pop()).trim();
        const gifNameEncoded = encodeURIComponent(rawGifName);

        const countData = JSON.stringify({ gif_name: rawGifName });

        if (navigator.sendBeacon) {
          navigator.sendBeacon("/api/update", countData);
        } else {
          await fetch("/api/update", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: countData
          });
        }

        const visitorData = JSON.stringify({
          visitor_id: visitorId,
          userAgent: navigator.userAgent,
          page: window.location.pathname,
          referrer: document.referrer,
          gif_name: rawGifName
        });

        if (navigator.sendBeacon) {
          navigator.sendBeacon("/api/log", visitorData);
        } else {
          await fetch("/api/log", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: visitorData
          });
        }

        const res = await fetch(`/api/deliver?gif_name=${gifNameEncoded}`);
        if (!res.ok) throw new Error(res.statusText);

        const blob = await res.blob();
        const url = URL.createObjectURL(blob);

        const a = document.createElement("a");
        a.href = url;
        a.download = rawGifName;
        document.body.appendChild(a);
        a.click();
        a.remove();

        setTimeout(() => URL.revokeObjectURL(url), 10000);

        try {
          const countRes = await fetch(`/api/count?gif_name=${gifNameEncoded}`);
          if (countRes.ok) {
            const countDataRes = await countRes.json();
            const safeCount = countDataRes.count ?? 0;
            if (countEl) {
              countEl.textContent = `Downloads: ${safeCount}`;
            }
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

/* 5) Right-click & middle-click logging on GIFs */
function initContextMenuLogging(visitorId) {
  document.querySelectorAll(".gif-item img").forEach(img => {
    const logBoth = () => {
      const gifNameRaw = decodeURIComponent(img.dataset.gif.split("gif_name=").pop()).trim();

      const countData = JSON.stringify({ gif_name: gifNameRaw });

      if (navigator.sendBeacon) {
        navigator.sendBeacon("/api/update", countData);
      } else {
        fetch("/api/update", {
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
        gif_name: gifNameRaw
      });

      if (navigator.sendBeacon) {
        navigator.sendBeacon("/api/log", visitorData);
      } else {
        fetch("/api/log", {
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

/* 7) Star-trail mouse effect */
function initStarTrails() {
  const container = document.createElement("div");
  container.style.position = "fixed";
  container.style.top = "0";
  container.style.left = "0";
  container.style.width = "100%";
  container.style.height = "100%";
  container.style.pointerEvents = "none";
  container.style.zIndex = "9999";
  container.style.overflow = "visible";
  document.body.appendChild(container);

  const stars = [];
  const maxStars = 20;

  function createStar(x, y) {
    const star = document.createElement("div");
    star.textContent = "★";
    star.className = "star";
    star.style.position = "absolute";
    star.style.left = `${x}px`;
    star.style.top = `${y}px`;
    star.style.opacity = "1";
    star.style.fontSize = `${Math.random() * 12 + 8}px`;
    star.style.transition = "opacity 0.7s ease-out";
    container.appendChild(star);

    return {
      element: star,
      x,
      y,
      life: 700,
      velocityX: (Math.random() - 0.5) * 1,
      velocityY: (Math.random() - 0.5) * 1,
      created: Date.now()
    };
  }

  document.addEventListener("mousemove", e => {
    if (stars.length >= maxStars) {
      const oldest = stars.shift();
      container.removeChild(oldest.element);
    }
    stars.push(createStar(e.clientX, e.clientY));
  });

  function animateStars() {
    const now = Date.now();
    for (let i = stars.length - 1; i >= 0; i--) {
      const star = stars[i];
      const elapsed = now - star.created;
      if (elapsed > star.life) {
        container.removeChild(star.element);
        stars.splice(i, 1);
        continue;
      }
      star.x += star.velocityX;
      star.y += star.velocityY;
      star.element.style.left = `${star.x}px`;
      star.element.style.top = `${star.y}px`;
      star.element.style.opacity = `${1 - elapsed / star.life}`;
    }
    requestAnimationFrame(animateStars);
  }
  animateStars();
}

/* Fetch and update download counts on page load */
async function fetchAndDisplayAllDownloadCounts() {
  const gifItems = document.querySelectorAll(".gif-item");

  for (const item of gifItems) {
    const img = item.querySelector("img");

    if (img?.dataset.gif) {
      const rawGifName = decodeURIComponent(img.dataset.gif.split("gif_name=").pop()).trim();
      const gifNameEncoded = encodeURIComponent(rawGifName);

      try {
        const res = await fetch(`/api/count?gif_name=${gifNameEncoded}`);

        if (res.ok) {
          const data = await res.json();
          const countEl = item.querySelector(".download-count");

          if (countEl) {
            const safeCount = data.count ?? 0;
            countEl.textContent = `Downloads: ${safeCount}`;
          }
        }
      } catch (err) {
        console.error(`Error fetching download count for ${rawGifName}:`, err);
      }
    }
  }
}

/* END — NO SERVICE WORKER */


/* ---------------------------------------------------------
   SERVICE WORKER REGISTRATION (GIF-only)
--------------------------------------------------------- */
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/service-worker.js');
}
