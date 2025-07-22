// scripts.js

document.addEventListener("DOMContentLoaded", () => {
  initLazyLoad();
  initOverlay();
  initDarkMode();
  initDownloadHandlers();
  initContextMenuLogging();
  initConsentBanner();
  initStarTrails();
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
      // Prime first few
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
function initDownloadHandlers() {
  document.querySelectorAll(".download-btn").forEach(btn => {
    btn.addEventListener("click", async () => {
      const originalText = btn.textContent;
      btn.textContent = "Downloading…";
      btn.disabled = true;

      // Find related elements
      const gifItem = btn.closest(".gif-item");
      const img     = gifItem.querySelector("img");
      const countEl = gifItem.querySelector(".download-count");
      const gifName = img.dataset.gif.split("/").pop();

      try {
        // A) Increment button-click total
        await fetch("/.netlify/functions/update-download-count", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ gif_name: gifName })
        });

        // B) Log visitor & download event
        await fetch("/.netlify/functions/logVisitor", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            visitor_id:  "anonymous",
            userAgent:   navigator.userAgent,
            page:        window.location.pathname,
            referrer:    document.referrer,
            gif_name:    gifName
          })
        });

        // C) Fetch via deliver_gif and trigger real download
        const res = await fetch(`/.netlify/functions/deliver_gif?gif_name=${encodeURIComponent(gifName)}`);
        if (!res.ok) throw new Error(res.statusText);
        const blob = await res.blob();
        const url  = URL.createObjectURL(blob);
        const a    = document.createElement("a");
        a.href     = url;
        a.download = gifName;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);

        // D) Refresh on-page button count
        const countRes  = await fetch(`/.netlify/functions/get-download-count?gif_name=${encodeURIComponent(gifName)}`);
        const countData = await countRes.json();
        countEl.textContent = `Downloads: ${countData.count}`;
      }
      catch (err) {
        console.error("Download error:", err);
      }
      finally {
        btn.textContent = originalText;
        btn.disabled   = false;
      }
    });
  });
}


// 5) Right-click & middle-click logging
function initContextMenuLogging() {
  document.querySelectorAll(".gif-item img").forEach(img => {
    const logBoth = () => {
      const gifName = (img.dataset.gif || "").split("/").pop();

      // Button-count table
      fetch("/.netlify/functions/update-download-count", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gif_name: gifName })
      }).catch(console.error);

      // Visitor + gif_downloads + summary
      fetch("/.netlify/functions/logVisitor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          visitor_id:  "anonymous",
          userAgent:   navigator.userAgent,
          page:        window.location.pathname,
          referrer:    document.referrer,
          gif_name:    gifName
        })
      }).catch(console.error);
    };

    img.addEventListener("contextmenu", logBoth);
    img.addEventListener("auxclick", e => {
      if (e.button === 1) logBoth;
    });
  });
}


// 6) Cookie-consent banner
function initConsentBanner() {
  if (localStorage.getItem("cookiesAccepted") === "true") {
    document.querySelectorAll(".download-btn").forEach(btn => btn.disabled = false);
    return;
  }

  document.querySelectorAll(".download-btn").forEach(btn => btn.disabled = true);
  const banner = document.createElement("div");
  banner.id  = "consent-banner";
  banner.innerHTML =
    `<p>We use cookies to ensure you get the best experience.
       <button id="acceptConsent">Accept</button>
     </p>`;

  document.body.appendChild(banner);
  banner.querySelector("button").addEventListener("click", () => {
    localStorage.setItem("cookiesAccepted", "true");
    banner.style.display = "none";
    document.querySelectorAll(".download-btn").forEach(btn => btn.disabled = false);
  });
}


// 7) Star-trail mouse effect
function initStarTrails() {
  const container = document.createElement("div");
  container.style.position       = "fixed";
  container.style.pointerEvents  = "none";
  container.style.zIndex         = "9999";
  document.body.appendChild(container);

  const stars = [];
  const total = 5;
  let index    = 0;

  for (let i = 0; i < total; i++) {
    const star = document.createElement("div");
    star.textContent = "★";
    star.className   = "star";
    container.appendChild(star);
    stars.push(star);
  }

  document.addEventListener("mousemove", e => {
    const star = stars[index];
    star.style.left    = `${e.clientX}px`;
    star.style.top     = `${e.clientY}px`;
    star.style.opacity = "1";
    setTimeout(() => { star.style.opacity = "0"; }, 500);
    index = (index + 1) % total;
  });
}