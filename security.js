document.addEventListener("contextmenu",e=>e.preventDefault());
document.addEventListener("keydown",e=>{
  if(e.key==="F12"||(e.ctrlKey&&e.shiftKey&&["I","J","C"].includes(e.key))||(e.ctrlKey&&["u","s"].includes(e.key)))
    e.preventDefault();
});
