<template>
  <ha-card>
    <v-style>
      .net {
        height: 100%;
        margin: 0;
        overflow: hidden;
      }
      .node {
        stroke: var(--zigbee2mqtt-networkmap-node-color, rgba(18, 120, 98, .7));
        stroke-width: 3px;
        -webkit-transition: fill .5s ease;
        transition: fill .5s ease;
        fill: var(--zigbee2mqtt-networkmap-node-fill-color, #dcfaf3);
      }
      .node.selected {
        stroke: #caa455;
      }
      .node.pinned {
        stroke: var(--zigbee2mqtt-networkmap-node-pinned-color, rgba(190, 56, 93, .6));
      }
      .link {
        stroke: var(--zigbee2mqtt-networkmap-link-color, rgba(18, 120, 98, .5));
      }
      .link, .node {
        stroke-linecap: round;
      }
      .link:hover, .node:hover {
        stroke: var(--zigbee2mqtt-networkmap-hover-color, #be385d);
      }
      .node:hover {
        stroke-width: 5px;
      }
      .link.selected {
        stroke: var(--zigbee2mqtt-networkmap-link-selected-color, rgba(202, 164, 85, .6));
      }
      .curve {
        fill: none;
      }
      .link-label, .node-label {
        fill: var(--zigbee2mqtt-networkmap-label-color, #127862);
      }
      .node-label {
        stroke: var(--ha-card-background, var(--card-background-color, #fff));
        stroke-width: 0.5em;
        paint-order: stroke;
        stroke-opacity: 0.7;
        stroke-linejoin: round;
      }
      .link-label {
        dominant-baseline: text-after-edge;
        dominant-baseline: ideographic;
        text-anchor: middle;
      }
      #m-end path {
        fill: var(--zigbee2mqtt-networkmap-arrow-color, rgba(18, 120, 98, 0.7));
      }
      .node.coordinator {
        stroke: var(--zigbee2mqtt-networkmap-node-coordinator-color, rgba(224, 78, 93, .7));
      }
      .node.router {
        stroke: var(--zigbee2mqtt-networkmap-node-router-color, rgba(0, 165, 255, .7));
      }
      .flex {
        display: flex;
        justify-content: space-between;
        align-items: center;
      }
      svg g {
        transition: all .35s cubic-bezier(0.65, 0.75, 0.25, 1);
        transform-origin: center;
      }
      ha-slider {
        width: 100%;
      }
      {{ css }}
    </v-style>
    <d3-network :net-nodes="nodes" :net-links="links" :options="options" :link-cb="link_cb" ref="net" />
    <svg style="display: none" width="0" height="0">
      <defs>
        <marker id="m-end" markerWidth="10" markerHeight="10" refX="12" refY="2" orient="auto" markerUnits="strokeWidth" >
          <path d="M0,0 L0,4 L8,2 z"></path>
        </marker>
      </defs>
    </svg>
    <div class="card-actions">
      <div class="flex">
        <ha-slider step="0.1" min="0.1" max="2" value="1" @input="zoomInOut"></ha-slider>
      </div>
      <div class="flex">
        <ha-button @click="refresh" appearance="plain">Refresh</ha-button>
        <div class="time">{{ state }}</div>
      </div>
    </div>
  </ha-card>
</template>

<script>
import D3Network from 'vue-d3-network'
import isEqual from 'lodash.isequal'

export default {
  components: {
    D3Network
  },
  data () {
    return {
      initialized: false,
      config: {},
      hass: null,
      nodes: [],
      links: [],
      state: ''
    }
  },
  computed: {
    options () {
      const config = this.config
      return {
        fontSize: config.font_size || 12,
        force: config.force || 3000,
        linkLabels: true,
        linkWidth: config.link_width || 2,
        nodeLabels: true,
        nodeSize: config.node_size || 16,
        height: config.height ? Number(config.height) : 400,
        showSlider: config.show_slider || 'auto'
      }
    },
    css () {
      let css = ''
      if (this.config.show_slider === true) {
        css = `
          @media screen and (min-width: 870px) {
            ha-slider {
              display: block
            }
          }`
      } else if (this.config.show_slider === false) {
        css = `
          ha-slider {
            display: none
          }`
      } else {
        css = `
          @media screen and (min-width: 870px) {
            ha-slider {
              display: none
            }
          }`
      }
      return css + this.config.css || ''
    }
  },
  watch: {
    hass (newHass, oldHass) {
      const entity = this.config.entity
      if (newHass && entity && newHass.states[entity]) {
        const newAttr = newHass.states[entity].attributes
        let oldAttr = null
        if (oldHass) {
          oldAttr = oldHass.states[entity].attributes
        }
        if (newAttr !== oldAttr) {
          this.state = newHass.states[entity].state
        }
        if (!isEqual(newAttr, oldAttr)) {
          this.update()
        }
      }
    },
    config (newConfig, oldConfig) {
      if (newConfig) {
        this.$nextTick(() => {
          this.$refs.net.size.h = newConfig.height || 400
          // stop increasing height on window resize (possible bug in vue-d3-network?)
          this.$refs.net.$refs.svg.$el.setAttribute('style', `max-height: ${newConfig.height || '400px'}`)
          this.$refs.net.onResize()
        })
      }
    }
  },
  methods: {
    link_cb (link) {
      link._svgAttrs = { 'marker-end': 'url(#m-end)' }
      return link
    },
    merge (target, source, map) {
      const result = []
      const store = {}
      if (source) {
        source.forEach(e => {
          const r = map(e)
          store[r.id] = r
        })
      }
      target.forEach((e, i) => {
        const key = e.id
        if (key in store) {
          for (const k in store[key]) {
            e[k] = store[key][k]
          }
          result.push(e)
          delete store[key]
        }
      })
      for (const k in store) {
        result.push(store[k])
      }
      return result
    },
    refresh () {
      this.state = 'Refreshing...'
      const mqttBaseTopic = this.config.mqtt_base_topic || 'zigbee2mqtt'
      const mqttTopic = this.config.mqtt_topic || mqttBaseTopic + '/bridge/request/networkmap'
      const payload = this.config.mqtt_payload || { type: 'raw', routes: true }
      this.hass.callService('mqtt', 'publish', {
        topic: mqttTopic,
        payload: JSON.stringify(payload)
      })
    },
    zoomInOut (event) {
      event.preventDefault()

      const svg = this.$refs.net.$refs.svg.$el
      if (event.type !== 'wheel') {
        for (const elem of svg.querySelectorAll('g')) {
          elem.setAttribute('style', `transform: scale(${event.target.value})`)
        }
      } else {
        let scale = event.deltaY / 1000
        scale = Math.abs(scale) < 0.1 ? 0.1 * event.deltaY / Math.abs(event.deltaY) : scale

        let [width2, height2, x2, y2] = [0, 0, 0, 0]
        const [x, y, width, height] = svg.getAttribute('viewBox')?.split(' ').map(Number) ?? [0, 0, svg.clientWidth, svg.clientHeight]

        let pt = new DOMPoint(event.clientX, event.clientY)
        pt = pt.matrixTransform(svg.getScreenCTM().inverse())

        const [xPropW, yPropH] = [(pt.x - x) / width, (pt.y - y) / height]

        width2 = width + width * scale
        height2 = height + height * scale
        x2 = pt.x - xPropW * width2
        y2 = pt.y - yPropH * height2

        svg.setAttribute('viewBox', `${x2} ${y2} ${width2} ${height2}`)
      }
    },
    transform (attr, config) {
      return {
        nodes: {
          source: attr.nodes,
          map: d => {
            return {
              id: d.ieeeAddr,
              name: d.type === 'Coordinator' ? ' ' : d.friendlyName,
              _cssClass: d.type ? d.type.toLowerCase() : ''
            }
          }
        },
        links: {
          source: attr.links.filter(
            d => {
              const nodes = attr.nodes.map(d => d.ieeeAddr)
              return nodes.includes(d.source.ieeeAddr) &&
              nodes.includes(d.target.ieeeAddr)
            }
          ),
          map: d => {
            return {
              id: d.source.ieeeAddr + d.target.ieeeAddr,
              sid: d.source.ieeeAddr,
              tid: d.target.ieeeAddr,
              name: d.linkquality
            }
          }
        }
      }
    },
    update () {
      const attr = this.hass.states[this.config.entity].attributes
      if (!attr.nodes && !this.initialized) {
        this.initialized = true
        this.refresh()
        return
      }
      const { nodes, links } = this.transform(attr, this.config)
      this.nodes = this.merge(this.nodes, nodes.source, nodes.map)
      this.links = this.merge(this.links, links.source, links.map)
    }
  },
  mounted () {
    const me = this
    const handleResize = () => {
      this.$refs.net.onResize()

      new ResizeObserver(() => {
        this.$refs.net.onResize()
      }).observe(this.$el)

      this.$refs.net.size.h = this.options.height || 400

      // stop increasing height on window resize (possible bug in vue-d3-network?)
      this.$refs.net.$refs.svg.$el.setAttribute('style', `max-height: ${this.options.height || '400px'}`)
      this.$refs.net.$refs.svg.$el.onwheel = function (event) {
        me.zoomInOut(event)
      }
    }

    requestAnimationFrame(handleResize)
  }
}
</script>
