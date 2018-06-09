'use strict';

const React = require('react');

class ListBox extends React.PureComponent {
	constructor(props) {
		super(props);
		this.state = {
			selectedIndex: -1
		};
		this.container = null;
		this.onKeydown = event => {
			if (event.target.tagName === 'INPUT') {
				// Don't (double-)handle keys that target INPUT elements
				return;
			}
			let {selectedIndex} = this.state;
			const visibleItems = ListBox.getVisibleItems(this.props);
			let visibleIndex = visibleItems.indexOf(selectedIndex);
			let handled = true;
			switch (event.key) {
				case 'ArrowDown':
					visibleIndex++;
					break;
				case 'ArrowUp':
					visibleIndex--;
					break;
				case 'End':
					visibleIndex = visibleItems.length - 1;
					break;
				case 'Home':
					visibleIndex = 0;
					break;
				// case 'PageDown':
				// case 'PageUp':
				default:
					handled = false;
					break;
			}
			if (handled) {
				visibleIndex = Math.max(0, Math.min(visibleItems.length - 1, visibleIndex));
				selectedIndex = visibleItems.length ? visibleItems[visibleIndex] : -1;
				if (selectedIndex !== this.state.selectedIndex) {
					this.setSelectedIndex(selectedIndex);
					event.preventDefault();
				}
			}
		};
	}

	componentDidMount() {
		window.addEventListener('keydown', this.onKeydown); // this.container.addEventListener
	}

	componentWillUnmount() {
		window.removeEventListener('keydown', this.onKeydown); // this.container.addEventListener
	}

	static getDerivedStateFromProps(props, state) {
		const visibleItems = ListBox.getVisibleItems(props);
		let {selectedIndex} = state;
		if ((selectedIndex === -1) && (visibleItems.length > 0)) {
			selectedIndex = 0;
		} else if ((selectedIndex !== -1) && (visibleItems.length === 0)) {
			selectedIndex = -1;
		} else if ((selectedIndex !== -1) && (visibleItems.indexOf(selectedIndex) === -1)) {
			let newIndex = -1;
			for (let index = 0; index < props.items.length; index++) {
				if ((visibleItems.indexOf(index) !== -1) &&
					((index <= selectedIndex) || ((index > selectedIndex) && (newIndex === -1)))) {
					newIndex = index;
				}
			}
			selectedIndex = newIndex;
		}
		return {
			selectedIndex
		};
	}

	componentDidUpdate() {
		this.props.onSelected(this.state.selectedIndex);
	}

	render() {
		const {selectedIndex} = this.state;
		const items = this.props.items || [];
		const lis = items.map((item, index) => {
			const selected = selectedIndex === index;
			const visible = this.props.visibilityForItem(item);
			return React.createElement(
				'li', {
					key: this.props.keyForItem(item),
					className: this.props.itemClass + (selected ? ` ${this.props.selectedItemClass}` : ''),
					style: visible ? null : {
						display: 'none'
					},
					onClick: () => {
						this.setSelectedIndex(index);
					},
					ref: selected ? element => {
						if (element) {
							element.scrollIntoViewIfNeeded();
						}
					} : null
				},
				this.props.elementForItem(item, index)
			);
		});
		lis.push(React.createElement(
			'li', {
				key: 'WIDTH-PLACEHOLDER',
				className: this.props.itemClass,
				style: {
					height: 0
				}
			})
		);
		return React.createElement(
			'ul', {
				className: this.props.containerClass,
				ref: element => {
					this.container = element;
				}
			},
			lis
		);
	}

	setSelectedIndex(selectedIndex) {
		this.setState({
			selectedIndex
		});
		this.props.onSelected(selectedIndex);
	}

	static getVisibleItems(props) {
		const visibleItems = [];
		props.items.forEach((item, index) => {
			if (props.visibilityForItem(item)) {
				visibleItems.push(index);
			}
		});
		return visibleItems;
	}
}

module.exports = ListBox;
