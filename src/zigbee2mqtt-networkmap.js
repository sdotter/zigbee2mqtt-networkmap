import Vue from 'vue'
import wrap from '@vue/web-component-wrapper'
import Zigbee2mqttNetworkmapVue from './components/Zigbee2mqttNetworkmap'

Vue.component('v-style', {
  render: function (createElement) {
    return createElement('style', this.$slots.default)
  }
})

const Zigbee2mqttNetworkmapWrap = wrap(Vue, Zigbee2mqttNetworkmapVue)

class Zigbee2mqttNetworkmap extends Zigbee2mqttNetworkmapWrap {
  constructor () {
    super()

    // eslint-disable-next-line
    console.info('%c  ZIGBEE2MQTT-NETWORKMAP IS LOADED  ', 'color: #ff9800; font-weight: bold; background-color: black')
  }

  get hass () {
    return this._hass
  }

  set hass (hass) {
    this._hass = hass
    const vm = this.vueComponent
    if (vm) {
      vm.hass = this._hass
    }
  }

  setConfig (config) {
    this._config = config
    const vm = this.vueComponent
    if (vm) {
      vm.config = this._config
    }
  }

  connectedCallback () {
    super.connectedCallback()
    const vm = this.vueComponent
    if (this._config) {
      vm.config = this._config
    }
    if (!vm.hass) {
      vm.hass = this._hass
    }
  }
}

window.customElements.define('zigbee2mqtt-networkmap', Zigbee2mqttNetworkmap)
