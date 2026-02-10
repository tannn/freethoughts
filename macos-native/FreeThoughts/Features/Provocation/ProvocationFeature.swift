import ComposableArchitecture

@Reducer
struct ProvocationFeature {
    @ObservableState
    struct State: Equatable {}

    enum Action {}

    var body: some ReducerOf<Self> {
        Reduce { state, action in
            return .none
        }
    }
}
