document.addEventListener('DOMContentLoaded',function(){if('caches' in window){caches.open('my-gif-cache').then(cache=>{document.querySelectorAll('.gif-item img').forEach(img=>{cache.add(img.src)})})}
const darkModeToggle=document.getElementById('toggleDarkMode');const body=document.body;if(darkModeToggle){darkModeToggle.addEventListener('click',()=>{body.classList.toggle('dark-mode');localStorage.setItem('darkMode',body.classList.contains('dark-mode'))})}
if(localStorage.getItem('darkMode')==='true'){body.classList.add('dark-mode')}
const gifContainer=document.querySelector('.gif-container');gifContainer.addEventListener('click',function(e){if(e.target.classList.contains('download-btn'))return;const gifItem=e.target.closest('.gif-item');if(gifItem){const img=gifItem.querySelector('img');const existingOverlay=document.querySelector('.fullsize-overlay');if(existingOverlay){document.body.removeChild(existingOverlay)}
const overlay=document.createElement('div');overlay.className='fullsize-overlay';const fullsizeImage=document.createElement('img');fullsizeImage.src=img.src;fullsizeImage.className='fullsize-image';overlay.appendChild(fullsizeImage);document.body.appendChild(overlay);overlay.addEventListener('click',function(){document.body.removeChild(overlay)})}});const starContainer=document.createElement('div');starContainer.style.position='fixed';starContainer.style.pointerEvents='none';starContainer.style.zIndex='9999';document.body.appendChild(starContainer);const stars=[];const starCount=5;for(let i=0;i<starCount;i++){const star=document.createElement('div');star.textContent='★';star.className='star';starContainer.appendChild(star);stars.push(star)}
let currentIndex=0;function updateStarPosition(e){if(!e||!e.clientX||!e.clientY)return;const star=stars[currentIndex];star.style.left=e.clientX+'px';star.style.top=e.clientY+'px';star.style.opacity='1';setTimeout(()=>{star.style.opacity='0'},500);currentIndex=(currentIndex+1)%starCount}
document.addEventListener('mousemove',updateStarPosition);document.querySelectorAll('.download-btn').forEach(button=>{const gifName=button.getAttribute('data-gif');const countSpan=button.nextElementSibling;const storedCount=localStorage.getItem(`downloads_${gifName}`)||0;if(countSpan){countSpan.textContent=`Downloads: ${storedCount}`}
button.addEventListener('click',function(){const gifName=this.getAttribute('data-gif');const link=document.createElement('a');link.href=gifName;link.download=gifName;document.body.appendChild(link);link.click();document.body.removeChild(link);const countSpan=this.nextElementSibling;if(countSpan){let count=parseInt(localStorage.getItem(`downloads_${gifName}`)||0);count++;localStorage.setItem(`downloads_${gifName}`,count);countSpan.textContent=`Downloads: ${count}`}})})
document.querySelectorAll('.gif-item img').forEach(img=>{const originalSrc=img.src;img.src='placeholder.jpg';img.dataset.src=originalSrc});const observer=new IntersectionObserver((entries,observer)=>{entries.forEach(entry=>{if(entry.isIntersecting){const img=entry.target;img.src=img.dataset.src;observer.unobserve(img)}})},{rootMargin:'200px'});document.querySelectorAll('.gif-item img').forEach(img=>observer.observe(img))})