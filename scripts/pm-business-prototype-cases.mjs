// Fixed host-owned regression cases. These expectations are independent of model replies.
export function hostPrototypeCases(){
 const step=(assertion,selector,expected)=>({action:'assert',assertion,selector,expected});
 const click=selector=>({action:'click',selector}),fill=(selector,value)=>({action:'fill',selector,value});
 const start=[click('[data-src="manual"]'),click('#nextBtn')],test=(id,steps,expectedDescription)=>({id,title:id,steps,...(expectedDescription?{expectedDescription}:{})});
 return [
  test('native-field-rules',[click('[data-src="manual"]'),...start,step('readonly','input[data-ro="1"]',true),step('readonly','#f_loc',true),fill('#f_name','甲'.repeat(55)),step('value','#f_name','甲'.repeat(50)),fill('#f_detail','修订测试详细地址'),step('value','#f_detail','修订测试详细地址')]),
  test('normal-success',[...start,fill('#f_name','隔离修订验收门店'),click('#locBtn'),click('#submitBtn'),step('text','#topTitle','新增成功'),step('visible','#againBtn',true)]),
  test('duplicate-warning',[...start,fill('#f_name','惠优乐超市'),click('#locBtn'),click('#submitBtn'),{...step('text','#dialog','疑似重复门店'),match:'contains'}]),
  test('simulated-failure-modify-retry',[...start,fill('#f_name','隔离修订失败门店'),click('#locBtn'),click('#simulateFailure'),click('#submitBtn'),{...step('text','#serviceError','模拟服务失败'),match:'contains'},step('visible','#retryBtn',true),fill('#f_name','隔离修订恢复门店'),step('visible','#serviceError',false),click('#simulateFailure'),click('#retryBtn'),step('text','#topTitle','新增成功')]),
  test('validation-before-simulated-service',[...start,click('#simulateFailure'),click('#submitBtn'),step('visible','#err_name',true),step('visible','#serviceError',false),click('#dlgBtn'),fill('#f_name','隔离字段优先校验门店'),click('#locBtn'),fill('#f_phone','123'),click('#submitBtn'),step('visible','#err_phone',true),step('visible','#serviceError',false)],'模拟失败开启时，空必填或非法电话仍先触发字段校验，不先进入服务失败。'),
  test('phone-correction-clears-errors',[...start,fill('#f_name','隔离电话清错门店'),click('#locBtn'),fill('#f_phone','123'),click('#submitBtn'),step('visible','#err_phone',true),click('#dlgBtn'),fill('#f_phone','13812345678'),step('visible','#err_phone',false),click('#simulateFailure'),click('#submitBtn'),step('visible','#serviceError',true),fill('#f_phone','13912345678'),step('visible','#serviceError',false)],'修正电话后不再次提交就清旧格式错误；服务失败后电话修改也及时清旧服务错误。'),
  test('simulation-control-reenter-consistency',[...start,click('#simulateFailure'),click('#backBtn2'),click('#nextBtn'),step('checked','#simulateFailure',true),fill('#f_name','隔离返回表单门店'),click('#locBtn'),click('#submitBtn'),step('visible','#serviceError',true)],'本版选择保留开启：返回再进入须回显勾选，合法提交也处于模拟失败状态。若未来改为明确重置关闭，应另行更新此版本策略；该DSL不表达二者任选。'),
  test('location-correction-clears-error',[...start,fill('#f_name','隔离定位清错门店'),click('#submitBtn'),step('visible','#err_loc',true),step('visible','#err_detail',true),click('#dlgBtn'),click('#locBtn'),step('value','#f_loc','中国四川省成都市武侯区天府三街288号（104.059175,30.547244）'),step('visible','#err_loc',false),step('visible','#err_detail',false)],'未定位时提交产生定位与详细地址错误；定位成功且自动填入详细地址后即时清对应旧错，不再次提交。'),
 ];
}
