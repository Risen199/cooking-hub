// middleware.js — handles clean URLs for BEIJU
export function middleware(request) {
  const url = new URL(request.url);
  const path = url.pathname;
  
  // Map of store slugs to store IDs
  const storeMap = {
    '/aunty-thandi': 'blb_01',
    '/bontles': 'bdp_01',
    '/mama-lerato': 'bdp_02',
    '/sis-portia': 'bdp_03',
    '/aunty-mapula': 'bdp_04',
    '/Bra-Skiles': 'bdp_05',
    '/mama-lebo': 'blb_02',
    '/sis-bongi': 'blb_03',
    '/mama-nomsa': 'blb_04',
    '/mama-pinky': 'blb_05',
    '/sis-lerato': 'blb_06',
    '/sis-pabalo': 'blb_07',
    '/aunty-zinhle': 'blb_08',
    '/mama-dineo': 'man_01',
    '/sis-thandi': 'man_02',
    '/aunty-naledi': 'man_03',
    '/mama-boitumelo': 'man_04',
    '/sis-lindiwe': 'man_05',
    '/mama-tumi': 'man_06',
    '/sis-nompumelelo': 'man_07',
    '/aunty-busisiwe': 'man_08',
    '/bazooka': 'new_01',
    '/sis-tumi': 'ses_01',
    '/mama-sipho': 'ses_02',
    '/aunty-lulu': 'ses_03',
    '/sis-mpho': 'ses_04',
    '/mama-kefilwe': 'ses_05',
    '/sis-neo': 'ses_06',
    '/mama-tshidi': 'ses_07',
    '/aunty-vuyo': 'ses_08',
    '/skile': 'val_01',
    '/nomsa-dish': 'vdk_01',
    '/mama-rose': 'vdk_02',
    '/sis-pinky': 'vdk_03',
    '/aunty-joyce': 'vdk_04',
    '/chef-bongi': 'vdk_05',
    '/mama-winnie': 'swt_01',
    '/sis-dudu': 'swt_02',
    '/chef-sipho': 'swt_03',
    '/aunty-rose': 'swt_04',
    '/mama-mokopane': 'mkn_01',
    '/sis-betty': 'mkn_02',
    '/chef-james': 'mkn_03',
    '/aunty-pinky': 'mkn_04',
    '/SThibos-Kitchen': 'tem_01',
    '/sis-nomsa': 'tem_02',
    '/chef-thabo-tem': 'tem_03',
    '/aunty-lettie': 'tem_04',
    '/mama-venda': 'tho_01',
    '/sis-tshifhiwa': 'tho_02',
    '/chef-mukhethwa': 'tho_03',
    '/aunty-mulalo': 'tho_04',
    '/chef-cheezy': 'smu_01',
    '/mama-rose-smu': 'smu_02',
    '/sis-tumi-smu': 'smu_03'
  };
  
  // Hub redirects
    const hubMap = {
    '/VAAL': 'VAL',
    '/Blouberg': 'BLB',
    '/Bedworthpark': 'BDP',
    '/Mankweng': 'MAN',
    '/seshego': 'SES',
    '/Vanderbijlpark': 'VDK',
    '/smu': 'SMU',
    '/thoyandou': 'THO',
    '/soweto': 'SWT',
    '/mokopane': 'MKN',
    '/tembisa': 'TEM'
  };
    
  // If it's a store slug
  if (storeMap[path]) {
    const storeId = storeMap[path];
    url.pathname = '/store-view.html';
    url.search = `?storeId=${storeId}`;
    return Response.redirect(url, 302);
  }
  
  // If it's a hub slug
  if (hubMap[path]) {
    const township = hubMap[path];
    url.pathname = '/hub.html';
    url.search = `?township=${township}`;
    return Response.redirect(url, 302);
  }
  
  // Otherwise, let the request go through
  return fetch(request);
}

export const config = {
  matcher: '/(.*)'
};