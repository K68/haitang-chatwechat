const axios = require('axios');
const wechat = require('wechat');
const express = require('express');
const LRU = require("lru-cache");
const options = { max: 500, maxAge: 1000 * 60 * 30 };
const cache = new LRU(options);
const urlPrefix = 'https://hi.amzport.com/api';
const regTs = /[\ |\~|\`|\!|\@|\#|\$|\%|\^|\&|\*|\(|\)|\-|\_|\+|\=|\||\\|\[|\]|\{|\}|\;|\:|\"|\'|\,|\<|\.|\>|\/|\?|\u3002|\uff1f|\uff01|\uff0c|\u3001|\uff1b|\uff1a|\u201c|\u201d|\u2018|\u2019|\uff08|\uff09|\u300a|\u300b|\u3008|\u3009|\u3010|\u3011|\u300e|\u300f|\u300c|\u300d|\ufe43|\ufe44|\u3014|\u3015|\u2026|\u2014|\uff5e|\ufe4f|\uffe5]/g;
// 封装方法

var postData = async function(urlSuffix, data) {
    console.log(data)
    const url = urlPrefix + urlSuffix;
    try{
        const response = await axios.post(url, data);
        return response.data.data;
    }catch (e) {
        console.error(error);
    }
};
const limitMap = (data,template, limit, huifu) => {
    const text = data.map((item, index)=> {
        if(index<limit){
            return template(index, item);
        }
    }).join('');
    if(text.trim()){
        return text;
    }else {
        return huifu;
    }
};
// 提取市区县
const getLocation = (str) => {
    const getArea = function(string) {
        let area = {};
        let index11 = 0;
        let index1 = string.indexOf("省");
        if (index1 == -1) {
            index11 = string.indexOf("自治区");
            if (index11 != -1) {
                area.Province = string.substring(0, index11 + 3)
            } else {
                area.Province = string.substring(0, 0)
            }
        } else {
            area.Province = string.substring(0, index1 + 1)
        }

        let index2 = string.indexOf("市");
        if (index11 == -1) {
            area.City = string.substring(index11 + 1, index2 + 1)
        } else {
            if (index11 == 0) {
                area.City = string.substring(index1 + 1, index2 + 1)
            } else {
                area.City = string.substring(index11 + 3, index2 + 1)
            }
        }

        let index3 = string.lastIndexOf("区");
        if (index3 == -1) {
            index3 = string.indexOf("县");
            area.Country = string.substring(index2 + 1, index3 + 1)
        } else {
            area.Country = string.substring(index2 + 1, index3 + 1)
        }
        return area;
    };
    const reg =/[\(|（](.+?)[\)|）]/;
    const macthList = reg.exec(str);
    if(macthList){
        //小括号里面有内容
        const content = macthList[1];
        return getArea(content);
    }else {
        //小括号里面没内容或者没括号
        const content = str;
        return getArea(content);
    }
};
const isExistCity = (str, cityList)=>{
    // 如果有城市返回城市信息 和查询的东西
    let bool = false;
    for(let i = 0 ; i<cityList.length; i+=1){
        if(str.startsWith(cityList[i].ciName)){
            const id = cityList[i].id;
            const info = str.replace(cityList[i].ciName,'').replace(/市|区|县/, '');
            bool=[cityList[i], info];
            break;
        }
    }
    return bool;
};
//变量
let cityList=[];
let smallCityList = [];
let bigCityList = [];
//模版
const orgTemplate = (index, item) => {
    const { orid, orName, lessons } = item;
    return''+ (index+1)+'.<a href="https://hi.amzport.com/app/#/orgTab/'+orid+'">'+orName+'</a>\n'+
        '  推荐课程：<a href="https://hi.amzport.com/app/#/searchInfo/'+(lessons[0].id)+'">'+(lessons[0].leTitle)+'</a>\n  '
};
const loactionTemplate = (index, item) => {
    const { orgs, ClassLocation} = item;
    return''+(index+1)+'.<a href="https://hi.amzport.com/app/#/orgTab/'+orgs.id+'">'+orgs.orName+'</a>\n 位置' +ClassLocation[1]+'\n'
};
const haveCacheService = (body, lonLat, res, area, MsgType)=> {
    const leTitle = body.indexOf('附近')!==-1 ?  body.replace('附近', ''): body;
    let glIndex = leTitle.indexOf('公里');
    if(glIndex===-1){
        glIndex = leTitle.indexOf('千米');
    }
    if(glIndex!==-1){
        const newInfo = leTitle.slice(glIndex + 2);
        const gl = leTitle.slice(0,glIndex).replace(/\D/g,'');
        if(gl){
            postData('/organization/queryOrgSearch', {apart: `${gl}:POINT(${lonLat})`, ciTag: null, city: null, cursorVal: null, leTitle: newInfo, offset: 0, size: 5 })
                .then((data)=>{
                    const text = limitMap(data,orgTemplate, 5, '附近没有这样的课程，试试“城市+关键词”吧');
                    res.reply(MsgType==='voice'? `识别到的语音为:${body}\n${text}`: text);
                });
        }else {
            res.reply(MsgType==='voice'? `识别到的语音为:${body}\n亲， 您说多少公里？`: '亲， 您说多少公里？')
        }
    }else {
        console.log('分支')
        const { City, Country} = area;
/*        const CountryId = smallCityList.find((item)=>(item.ciName === Country.replace(/[县|区]/,''))).id;*/
        postData('/organization/queryOrgSearch', {apart: null, ciTag:  City.replace(/[市]/, ''), city: null, cursorVal: null, leTitle: leTitle, offset: 0, size: 5 })
            .then((data)=>{
                const text = limitMap(data,orgTemplate, 5, '附近没有这样的课程，试试“城市+关键词”吧');
                res.reply(MsgType==='voice'? `识别到的语音为:${body}\n${text}`: text);
            })
    }
};
//app配置
var app = express();
var config = {
    token: 'HaiTangWechat666',
    appid: 'wxf7ea46eeccb3440a',
    encodingAESKey: 'pK7KgLvQQzNZnuOD3s4EuZXHliWfuyDgujx4kMSGGaM',
    checkSignature: false // 可选，默认为true。由于微信公众平台接口调试工具在明文模式下不发送签名，所以如要使用该测试工具，请将其设置为false
};
app.use(express.query());
app.use('/wechat', wechat(config, function (req, res, next) {
    // 微信输入信息都在req.weixin上
    var message = req.weixin;
    if(message.MsgType === 'text' || message.MsgType === 'voice'){
        const body = (message.MsgType === 'text'? message.Content: message.Recognition).trim().replace(regTs,'');
        const selectInfo = isExistCity(body, bigCityList);
        if(selectInfo){
            // 有大城市
            const city = selectInfo[0];
            const leTitle = selectInfo[1];
            postData('/organization/queryOrgSearch', {apart: null, ciTag: city.ciName, city: null, cursorVal: null, leTitle: leTitle, offset: 0, size: 5 })
                .then((data)=>{
                    const text = limitMap(data,orgTemplate, 5, `${city.ciName}目前没有您查询的课程信息`);
                    res.reply(text);
                })
        }else {
            console.log('文本里面没有大城市');
            const caceLocation = cache.get(message.FromUserName);
            if(caceLocation) {
                const lonLat = caceLocation[0];
                const area = caceLocation[1];
                // 根据用户传进来的值是否有附近进行把关键字比如(小提琴找出来)
                const selectInfo = isExistCity(body, smallCityList);
                if(selectInfo && selectInfo[0].ciTag === area.City.replace(/[市]/, '')){
                    const city = selectInfo[0];
                    const leTitle = selectInfo[1];
                    postData('/organization/queryOrgSearch', {apart: null, ciTag: area.City.replace(/[市]/, ''), city: city.id, cursorVal: null, leTitle: leTitle, offset: 0, size: 5 })
                        .then((data)=>{
                            const text = limitMap(data,orgTemplate, 5, `${city.ciName}目前找不到对应的课程`);
                            res.reply(message.MsgType === 'voice'? `识别到的语音为:${body}\n${text}`:text);
                        })
                }else {
                    haveCacheService(body, lonLat, res, area, message.MsgType)
                }
            }else {
                cache.set('info', body);
                cache.set('bodyType', message.MsgType);
                res.reply('亲，先发一个定位给我吧')
            }
        }
    }else if(message.MsgType === 'location'){
        const area = getLocation(message.Label);    //转成地理位置
        const lonLat = `${message.Location_Y} ${message.Location_X}`;
        cache.set(message.FromUserName, [lonLat, area]);   //存入cache
        const info = cache.get('info');
        if(info){
            //将缓存中的东西情空
            cache.set('info', '');
            const MsgType = cache.get('bodyType');
            const selectInfo = isExistCity(info, smallCityList);
            if(selectInfo && selectInfo[0].ciTag === area.City.replace(/[市]/, '')){
                const city = selectInfo[0];
                const leTitle = selectInfo[1];
                postData('/organization/queryOrgSearch', {apart: null, ciTag: area.City.replace(/[市]/, ''), city: city.id, cursorVal: null, leTitle: leTitle, offset: 0, size: 5 })
                    .then((data)=>{
                        const text = limitMap(data,orgTemplate, 5, `${city.ciName}目前找不到对应的课程`);
                        res.reply(MsgType==='voice'? `识别到的语音为:${body}\n${text}`: text);
                    })
            }else {
                haveCacheService(info, lonLat, res, area, MsgType)
            }
        }
    }else if(message.MsgType === 'event') {
        const key = message.EventKey;
        console.log('进入event');
        const def =  '1.搜索城市+关键词\n' +
            '（如：宁波瑜伽）\n' +
            '2.直接搜索关键词\n' +
            '（如：小提琴）\n' +
            '3.搜索附近+关键词\n' +
            '（如：附近跆拳道）\n' +
            '4.搜索几公里+附近+关键词\n' +
            '（如：10公里附近美术 或者 10千米附近美术）\n' +
            '5.搜索城市下的区县+关键词\n' +
            '（如：鄞州区英语或者鄞州英语）\n' +
            '文字输入或者语音输入以上话语就可以查询课程\n' +
            '(温馨提醒：2-5需要获取您的地理位置，以便我们方便查找您周围的课程)';
        if(key === 'lookHelp'){
            res.reply(def);
        }else {
            res.reply();
        }
    }else {
        res.reply();
    }
}));
//init
const init = async function () {
    const data = await postData('/city/query',{});
    cityList = data[0];
    for(let i = 0; i<cityList.length;i+=1){
        if(cityList[i].ciTag){
            smallCityList.push(cityList[i])
        }else {
            bigCityList.push(cityList[i])
        }
    }
    var server = app.listen(8668, function () {
        var host = server.address().address;
        var port = server.address().port;
        console.log("应用实例，访问地址为 http://%s:%s", host, port)

    })
};
init();
