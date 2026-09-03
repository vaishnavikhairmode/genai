require("dotenv").config()
const conncetTodb=require("./src/config/database.js")
const app=require("./src/app.js");
// const invokeAI=require("./src/services/ai.service.js")
conncetTodb();
app.listen(3000,()=>{
    console.log("server is listing on 3000");
})
