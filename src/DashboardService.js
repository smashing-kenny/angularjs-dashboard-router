import {Widget} from './WidgetService.js';

const PROVIDER_SUFFIX = 'Provider';

const DashboardState = Object.defineProperties({}, {
	ACTIVE: {
		value: 1,
		writable: false
	},
	SUSPENDED: {
		value: 2,
		writable: false
	},
	TERMINATED: {
		value: 0,
		writable: false
	}
});

class Dashboard{

	constructor(){
		this.$status = DashboardState.TERMINATED;
		this.$widgets = [];
		this.$events = {
			call: [],
			suspend: [],
			terminate: []
		};
	}

	getStatus(){
		return this.$status;
	}

	/**
	 * Pomecahem vse widgeti kak neizmenjaemie
	 */
	markAsImmutable(){
		this.$widgets.forEach((widget) => widget.setImmutable(true));
		return this;
	}

	call(/*arguments*/){
		this.$widgets.forEach((widget) => widget.setImmutable(false).call.apply(widget, arguments));
		this.$events.call.forEach((event) => event.apply(event, arguments));

		this.$status = DashboardState.ACTIVE;
		return this;
	}

	suspend(){
		this.$widgets.forEach((widget) => widget.suspend());
		this.$events.suspend.forEach((event) => event());
		this.$status = DashboardState.SUSPENDED;
		return this;
	}

	terminate(){
		this.$widgets.forEach((widget) => widget.terminate());
		this.$events.terminate.forEach((event) => event());
		this.$status = DashboardState.TERMINATED;
		return this;
	}

	widgets(){
		return this.$widgets;
	}

	create($templateRequest, $controller, $compile, $rootScope){
		return this.$widgets.map(function(widget){
			if(widget.isTerminated() == false){
				return true
			}
			
			if(widget.isTemplate() == false){
				return true
			}

			const desktop = document.getElementById("desktop");

			return $templateRequest(widget.getTemplate()).then(function success(html){
				const scope = angular.extend($rootScope.$new());
				const element = angular.element(html);
				
				$controller(widget.getController(), {
					$scope: scope,
					$element: element
				});

				Array.prototype.slice.call(element).forEach(x => desktop.appendChild(x));
				$compile(element)(scope);
			});
			
		});
	}
}

class DashboardService{

	constructor(widgetService, $injector, $provide){
		this.widgetService = widgetService;
		this.$provide = $provide;
		this.$injector = $injector;
	}

	static get $inject() {
		return ['WidgetServiceProvider', '$injector', '$provide'];
	}

	getOrCreateDashboard(name, constructor){
		const $injector = this.$injector;
		if($injector.has(name + PROVIDER_SUFFIX) == false){
			const dashboard = new Dashboard();

			dashboard.$get = function(){
				return Object.assign($injector.instantiate(constructor || function(){}), {
					onCall: function(callback){
						dashboard.$events.call.push(callback);
						return this;
					},
					onSuspend:function(callback){
						dashboard.$events.suspend.push(callback);
						return this;
					},
					onTerminate:function(callback){
						dashboard.$events.terminate.push(callback);
						return this;
					}
				});
			};

			this.$provide.provider(name, dashboard);
		}
		
		return this.$injector.get(name + PROVIDER_SUFFIX);
	}

	/**
	 * Metod registracii deshborda
	 * @param {*} name 
	 * @param {*} constructor 
	 */
	register(name, constructor){
		const dashboard = this.getOrCreateDashboard(name, constructor);
		const widgetService = this.widgetService;

		return {
			widget: function(name, constructor){
				const widget = widgetService.getOrCreateWidget(name, constructor);
				dashboard.widgets().push(widget);
				return this;
			},
			tempalte: function(options){
				const widget = new Widget();
				widget._template   = options.template;
				widget._controller = options.controller;
				dashboard.widgets().push(widget);
			}
		}
	}

	/**
	 * Metod
	 */
	get $get(){
		return ['$q', '$templateRequest', '$controller', '$compile', '$rootScope',
			function($q, $templateRequest, $controller, $compile, $rootScope){
				const $injector = this.$injector;
				//Na dannij moment aktivnij deshbord
				let $active = null;
				return {
					call:function(name){

						if($injector.has(name + PROVIDER_SUFFIX) == false)
							return;

						const dashboard = $injector.get(name + PROVIDER_SUFFIX);

						if($active == dashboard)
							return;

						dashboard.markAsImmutable();

						if(dashboard.getStatus() == DashboardState.TERMINATED){
							$q.all(dashboard.create($templateRequest, $controller, $compile, $rootScope)).then(() =>{
								if($active)
									$active.suspend()

								$active = dashboard.call();
							});

						}else{
							if($active)
								$active.suspend()

							$active = dashboard.call();
						}

					},
					terminate: function(){
						if($active)
							$active.terminate()
					}
				};
			}
		]
	}
}



export {Dashboard, DashboardService};