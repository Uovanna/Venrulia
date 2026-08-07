const L = (hex) => { const c=[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)/255)
  .map(v=>v<=0.03928?v/12.92:Math.pow((v+0.055)/1.055,2.4));
  return 0.2126*c[0]+0.7152*c[1]+0.0722*c[2]; };
const R = (a,b)=>{const x=L(a),y=L(b);return ((Math.max(x,y)+0.05)/(Math.min(x,y)+0.05));};

const day = { ground:"#DCD5C4", raised:"#E6E0D2", sunk:"#CFC7B3",
  ink:"#2A2118", soft:"#544A39", faint:"#655943",
  rubric:"#7A2E28", bole:"#54402C", verdigris:"#2F5245", gilt:"#7A5C24", rule:"#6B5F4B" };
const night = { ground:"#17130E", raised:"#211A13", sunk:"#0F0C08",
  ink:"#DFD5BE", soft:"#A99C82", faint:"#948569",
  rubric:"#D2664B", bole:"#A98156", verdigris:"#71AE93", gilt:"#CBA455", rule:"#5C4E39" };
night.gilt = "#CBA455";

const check = (name, pal) => {
  console.log("\n== " + name + " ==");
  for (const on of ["ground","raised"]) {
    for (const fg of ["ink","soft","faint","rubric","bole","verdigris","gilt","rule"]) {
      const r = R(pal[fg], pal[on]);
      const flag = r>=4.5 ? "AA  " : r>=3 ? "AA-lg" : "FAIL ";
      console.log(`  ${flag} ${r.toFixed(2).padStart(5)}  ${fg.padEnd(10)} on ${on}`);
    }
  }
};
check("DAY / vellum", day);
check("NIGHT / candlelight", night);
